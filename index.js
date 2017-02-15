'use strict';

var convert = require('color-convert');
var Characteristic, Service;

module.exports = function(homebridge)
{
    console.log("homebridge API version: " + homebridge.version);

    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    homebridge.registerAccessory('homebridge-magichome', 'MagicHome', MagicHomeAccessory, false);
};

function MagicHomeAccessory(log, config)
{

    this.log = log;
    this.config = config;
    this.name = config.name || 'LED Controller';
    this.setup = config.setup || 'RGBW';
    this.port = config.port || 5577;
    this.ip = config.ip;
    this.color = {H: 255, S:100, L:50};
    this.brightness = 100;
    this.purewhite = config.purewhite || false;

    this.getColorFromDevice();

}

MagicHomeAccessory.prototype.identify = function(callback)
{
    this.log('Identify requested!');
    callback();
};

MagicHomeAccessory.prototype.getServices = function()
{
    var informationService = new Service.AccessoryInformation();

    informationService
        .setCharacteristic(Characteristic.Manufacturer, 'ACME Ltd.')
        .setCharacteristic(Characteristic.Model, 'LED-controller')
        .setCharacteristic(Characteristic.SerialNumber, '123456789');

    var lightbulbService = new Service.Lightbulb(this.name);

    lightbulbService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getPowerState.bind(this))
        .on('set', this.setPowerState.bind(this));

    lightbulbService
        .addCharacteristic(new Characteristic.Hue())
        .on('get', this.getHue.bind(this))
        .on('set', this.setHue.bind(this));

    lightbulbService
        .addCharacteristic(new Characteristic.Saturation())
        .on('get', this.getSaturation.bind(this))
        .on('set', this.setSaturation.bind(this));

	lightbulbService
        .addCharacteristic(new Characteristic.Brightness())
        .on('get', this.getBrightness.bind(this))
        .on('set', this.setBrightness.bind(this));

    return [informationService, lightbulbService];

};

// MARK: - UTIL

MagicHomeAccessory.prototype.sendCommand = function(command, callback)
{
	var exec = require('child_process').exec;
	var cmd = "python " +  __dirname + '/flux_led.py ' + this.ip + ' ' + command;
        //console.log("Send command " + cmd.toString());
        try
        {
            exec(cmd, callback);
        }
        catch(e)
        {
            console.log("Send command Error " + e.message);  
        }
	
};

MagicHomeAccessory.prototype.getState = function (callback)
{
    this.sendCommand('-i', function(error, stdout)
    {
        var settings = { on: false, color: {H: 255, S: 50, L: 20} };

        var colors = stdout.match(/\(\d{3}\, \d{3}, \d{3}\)/g);
        var isOn = stdout.match(/\] ON /g);

        if(isOn && isOn.length > 0) settings.on = true;
        if(colors && colors.length > 0)
        {
            var converted = convert.rgb.hsl(stdout.match(/\d{3}/g));
            settings.color = {H: converted[0], S: converted[1], L: converted[2]};
	}

	callback(settings);

	});
};

MagicHomeAccessory.prototype.getColorFromDevice = function() 
{
    this.getState(function(settings){
        this.color = settings.color;
        this.log("DEVICE COLOR: %s", settings.color.H+','+settings.color.S+','+settings.color.L);
    }.bind(this));
};

MagicHomeAccessory.prototype.setToCurrentColor = function() 
{
    var v_color = this.color;

    if(v_color.S === 0 && v_color.H === 0 && this.purewhite)
    {
        this.setToWarmWhite();
        return;
    }
    else
    {
        v_color.L = 50;
    }
    
    var v_brightness = this.brightness;
    var converted = convert.hsl.rgb([v_color.H, v_color.S, v_color.L]);
    var adjustForBrightness = converted; 
    var i = 0;
    
    for(i = 0; i < converted.length; i++)
    {
        if(converted[i] > 0)
        {
            adjustForBrightness[i] = Math.round((converted[i] / 100) * v_brightness);
        }

    }
    
    var cmd = '-x ' + this.setup + ' -c ';
    cmd += adjustForBrightness[0] + ',' + adjustForBrightness[1] + ',' + adjustForBrightness[2];
    this.sendCommand(cmd);
    
    v_color = null;
    v_brightness = null;
    converted = null;
    adjustForBrightness = null;
    cmd =null;
};

MagicHomeAccessory.prototype.setToWarmWhite = function()
{
    var brightness = this.brightness;
    var base = '-x ' + this.setup + ' -w ';
    this.sendCommand(base + brightness);
    base = null;
    brightness = null;
};

// MARK: - POWERSTATE

MagicHomeAccessory.prototype.getPowerState = function(callback)
{
    this.getState(function(settings)
    {
	callback(null, settings.on);
    });
};

MagicHomeAccessory.prototype.setPowerState = function(value, callback)
{
    this.sendCommand(value ? '--on' : '--off', function()
    {
        callback();
    });
};

// MARK: - HUE

MagicHomeAccessory.prototype.getHue = function(callback)
{
    var color = this.color;
    callback(null, color.H);
};

MagicHomeAccessory.prototype.setHue = function(value, callback)
{
    this.color.H = value;
    this.setToCurrentColor();
    this.log("HUE: %s", value);

    callback();
};

// MARK: - BRIGHTNESS

MagicHomeAccessory.prototype.getBrightness = function(callback)
{
    var brightness = this.brightness;
    callback(null, brightness);
};

MagicHomeAccessory.prototype.setBrightness = function(value, callback)
{
    this.brightness = value;
    this.setToCurrentColor();
    this.log("BRIGHTNESS: %s", value);
    callback();
};

// MARK: - SATURATION

MagicHomeAccessory.prototype.getSaturation = function(callback)
{
    var color = this.color;
    callback(null, color.S);
};

MagicHomeAccessory.prototype.setSaturation = function(value, callback)
{
    this.color.S = value;
    this.setToCurrentColor();
    this.log("SATURATION: %s", value);

    callback();
};
