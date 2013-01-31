// vim: set encoding=utf-8 tabstop=4 softtabstop=4 shiftwidth=4 expandtab
//########################################################################
// Copyright 2012 KNX-User-Forum e.V.            http://knx-user-forum.de/
//########################################################################
//  This file is part of SmartHome.py.   http://smarthome.sourceforge.net/
//
//  SmartHome.py is free software: you can redistribute it and/or modify
//  it under the terms of the GNU General Public License as published by
//  the Free Software Foundation, either version 3 of the License, or
//  (at your option) any later version.
//
//  SmartHome.py is distributed in the hope that it will be useful,
//  but WITHOUT ANY WARRANTY; without even the implied warranty of
//  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//  GNU General Public License for more details.
//
//  You should have received a copy of the GNU General Public License
//  along with SmartHome.py. If not, see <http://www.gnu.org/licenses/>.
//########################################################################

function shCustomInit() {
    $(document).on("click", 'div.tile[data-sh]', function() { // Switch Button
        shSwitchButton(this);
    });
    $(document).on("vmousedown", 'img.push[data-sh]', function(event) { // Push Button
        event.preventDefault();
        shSendPush(this, true);
    });
    $(document).on("vmouseup", 'img.push[data-sh]', function() { // Push Button
        shSendPush(this, false);
    });
//    $(document).on("slidestop", 'input[data-sh][data-type="range"]', function() { // Slider
//        shSendNum(this);
//    });
    $(document).on("change", 'input[data-sh][type="hidden"]', function() { // Hidden Field
        shSendNum(this);
    });
};

function shRequestData() {
    shMonitor = $("[data-sh]").map(function() { if (this.tagName != 'A') { return $(this).attr("data-sh"); }}).add($("[data-sh-long]").map(function() { if (this.tagName != 'A') { return $(this).attr("data-sh-long"); }})).get();
    shMonitor = shUnique(shMonitor);
    shSend({'k': 'm', 'p': shMonitor});
    $("[data-rrd]").each( function() {
        var rrds = $(this).attr('data-rrd').split('|');
        var frame = $(this).attr('data-frame');
        for (i = 0; i < rrds.length; i++) {
            var rrd = rrds[i].split('=');
            var id = rrd[0];
            if (!(id in shRRD)) {
                shSend({'k': 'r', 'p': rrd[0], 'f': frame});
            } else if (!(frame in shRRD[id])) {
                shSend({'k': 'r', 'p': rrd[0], 'f': frame});
            };
        };
    });
    $("[data-log]").each( function() {
        var log = $(this).attr('data-log');
        var max = $(this).attr('data-max');
        if (!(log in shLog)) {
            shSend({'k':'l', 'l': log, 'm': max});
        };
    });
};

function shPageInit() {
    // update page items
    console.log('PageInit');
    for (path in shBuffer) {
        if (shMonitor.indexOf(path) != -1) { // if path in shMonitor
            shUpdateItem(path, shBuffer[path]);
        } else {
            delete shBuffer[path];
            delete shOpt[path];
        };
    };

    var allsliders = $('input[data-sh][data-type="range"]');
    allsliders.each(function (index, slider) {
        $(slider).slider();
    });

    // Init Items
    $(document).find(".dimmer").each(function() {
        $(this).on("vmousedown", 'img[data-sh-long]', function(event) { // Short/Long Button
            event.preventDefault();
            var obj = this;
            $(obj).data('timer', 
                setTimeout(function() {
                    $(obj).data('long', true);
                    var path = $(obj).attr('data-sh-long');
                    if ( path == shLock) { return; };
                    var val = Number($(obj).attr("value"));
                    shBufferUpdate(path, [val, 1], obj, true);
                }, 400)
            );
        });
        $(this).on("vmouseup", 'img[data-sh-long]', function() { // Short/Long Button
            clearTimeout($(this).data('timer'))
            if ($(this).data('long')) {
                $(this).data('long', false);
                var path = $(this).attr('data-sh-long');
                if ( path == shLock) { return; };
                var val = Number($(this).attr("value"));
                shBufferUpdate(path, [0, 0], this, true);
            } else {
                shSendFix(this);
            }
        });
    });

    $(document).find(".dimmer2").each(function() {
        $(this).on("vmousedown", 'img[data-sh-long]', function(event) { // Short/Long Button
            event.preventDefault();
            var obj = this;
            $(obj).data('timer', 
                setTimeout(function() {
                    clearTimeout($(obj).data('timer'));
                    $(obj).data('long', true);

                    var fn = function() {
                        $(obj).data('timer', setTimeout(function() {
                            clearTimeout($(obj).data('timer'));
                            if ($(obj).data('long') == false) { return; }
                            var path = $(obj).attr('data-sh-long');
                            if (path == shLock) { return; }
                            var val = Number($(obj).attr("value"));
                            shBufferUpdate(path, [val, 1], obj, true);
                            fn();
                        }, 200));
                    };

                    fn();
                }, 400)
            );
        });
        $(this).on("vmouseup", 'img[data-sh-long]', function() { // Short/Long Button
            clearTimeout($(this).data('timer'))
            if ($(this).data('long')) {
                $(this).data('long', false);
            } else {
                shSendFix(this);
            }
        });
    });

    $(document).find(".jalousie").each(function() {
        $(this).on("vmousedown", 'img[data-sh-long]', function(event) { // Short/Long Button
            event.preventDefault();
            var obj = this;
            $(obj).data('timer', 
                setTimeout(function() {
                    $(obj).data('long', true);
                    shSendFixLong(obj);
                }, 400)
            );
        });
        $(this).on("vmouseup", 'img[data-sh-long]', function() { // Short/Long Button
            clearTimeout($(this).data('timer'))
            if ($(this).data('long')) {
                $(this).data('long', false);
            } else {
                shSendFix(this);
            }
        });
    });
};

function shPageShow() {
    // check connection
    if ( shWS.readyState > 1 ){ // Socket closed
        shWsInit();
    };
    $.mobile.activePage.find($("[data-rrd]")).each(function() {
        shRRDDraw(this);
    });

    if (jQuery().miniColors) {
	    $('.color-picker').miniColors({
		    change: function(hex, rgba) {
                id = $(this).attr('id');
                $('#' + id + '_rot').val(rgba.r).trigger('change');
                $('#' + id + '_gruen').val(rgba.g).trigger('change');
                $('#' + id + '_blau').val(rgba.b).trigger('change');
		    }
	    });
    }

    if (jQuery().idleTimer) {

        if (document.location.href.match(/clock.html$/)) {
            $.idleTimer(100);

            $(document).bind("active.idleTimer", function() {
                document.location.href='index.html';
            });
        } else {
            $.idleTimer(120000);

            $(document).bind("idle.idleTimer", function() {
                document.location.href='clock.html';
            });
        }
    }
};

function shBufferUpdate(path, val, src, enforce){
    if ( path in shBuffer) {
        if (shBuffer[path] !== val || enforce){
            console.log(path + " changed to: " + val + " (" + typeof(val) + ")");
            shBuffer[path] = val;
            shSend({'k': 'i', 'p': path, 'v': val});
            shUpdateItem(path, val, src);
        };
    };
};

function shSendFix(obj){
    var path = $(obj).attr('data-sh');
    if ( path == shLock) { return; };
    var val = Number($(obj).attr("value"));
    shBufferUpdate(path, val, obj, true);
};

function shSendFixLong(obj){
    var path = $(obj).attr('data-sh-long');
    if ( path == shLock) { return; };
    var val = Number($(obj).attr("value"));
    shBufferUpdate(path, val, obj, true);
};

// Incoming Data //

function shUpdateItem(path, val, src) {
    var obj = $('[data-sh="' + path + '"]');
    if (obj.length == 0) {
        console.log("unknown id: "+ path);
        return;
    }
    //console.log('update found ' + obj.length + ' elements');
    $(obj).filter('[type!="radio"]').each(function() { // ignoring radio - see below
        element = this.tagName;
        if (src == this ) { // ignore source
            return true;
        };
        switch(element) {
            case 'DIV':
                if ( $(this).hasClass("badge") == true ){
                    $(this).removeClass(val ? "off" : "on");
                    $(this).addClass(val ? "on" : "off");
                } else if ( $(this).hasClass("tile") == false ){
                    $(this).html(val);
                };
                break;
            case 'SPAN':
                if ( $(this).hasClass("percent") ) {
                    $(this).html(val + "%");
                } else if ( $(this).hasClass("temperature") ) {
                    $(this).html(val.toFixed(1) + "°C");
                } else {
                    $(this).html(val);
                }
                break;
            case 'TEXTAREA':
                $(this).val(val);
                break;
            case 'SELECT':
                updateSelect(this, val);
                break;
            case 'INPUT':
                updateInput(this, val);
                break;
            case 'UL':
                updateList(this, val);
                break;
            case 'IMG':
                if ( $(this).attr("data-sh-long") ){
                    break;
                }

                if ( $(this).attr("class") != "set" ){
                    if ( path in shOpt ){
                        $(this).attr("src", shOpt[path][Number(val)]);
                        $(this).val(Number(val));
                    } else {
                        $(this).attr("src", val);
                    };
                };
                break;
            default:
                console.log("unknown element: " + element);
                break;
        };
    });
    // special care for input radio
    var radio = $(obj).filter('[type="radio"]')
    radio.removeAttr('checked');
    radio.filter("[value='" + val + "']").attr("checked","checked");
    try {
        $(radio).checkboxradio('refresh');
    } catch (e) {};
};

console.log('Init SmartHome.py v' + shVersion)
//shInit("ws://u12sh.fritz.box:2121/");
//shCustomInit();

// adapt default settings
//$.mobile.page.prototype.options.addBackBtn= true;
//$.mobile.page.prototype.options.backBtnText = "Zurück";
