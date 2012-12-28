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

var shVersion = 0.72;
var shWS = false; // WebSocket
var shLock = false;
var shRRD = {};
var shLog = {};
var shURL = '';
var shBuffer = {};
var shOpt = {};
var shMonitor = [];

// little helper functions
Array.prototype.diff = function(a) {
        return this.filter(function(i) {return !(a.indexOf(i) > -1);});
};
function shUnique(arr) {
    arr = arr.sort();
    var ret = [arr[0]];
    for (var i = 1; i < arr.length; i++) {
        if (arr[i-1] !== arr[i]) {
            ret.push(arr[i]);
        }
    }
    return ret;
};

function shInit(url) {
    // Init WebSocket
    shURL = url;
    shWsInit();
    setTimeout(shWSCheckInit , 2000);
    $(window).unload(function(){ shWS.close(); shWS = null });
    // Adding Listeners
    $(document).on( "pagecreate", function(){
        shPageCreate();
    });
    $(document).on( "pageinit", function(){
        shPageInit();
    });
    $(document).on( "pageshow", function(){
        shPageShow();
    });
    $(document).on("click", 'a[data-logic]', function() { // Button
        shTriggerLogic(this);
    });
    $(document).on("click", 'div.tile[data-sh]', function() { // Switch Button
        shSwitchButton(this);
    });
    $(document).on("click", 'img[data-logic]', function() { // Logic-Trigger Button
        shTriggerLogic(this);
    });
    $(document).on("click", 'img.switch[data-sh]', function() { // Switch Button
        shSwitchButton(this);
    });
    $(document).on("click", 'img.set[data-sh]', function() { // Send Button
        shSendFix(this);
    });
    $(document).on("vmousedown", 'img.push[data-sh]', function(event) { // Push Button
        event.preventDefault();
        shSendPush(this, true);
    });
    $(document).on("vmouseup", 'img.push[data-sh]', function() { // Push Button
        shSendPush(this, false);
    });
    $(document).on("change", 'select[data-sh]', function() { // Select
        shSendSelect(this);
    });
    $(document).on("slidestop", 'input[data-sh][data-type="range"]', function() { // Slider
        shSendNum(this);
    });
    $(document).on("change", 'input[data-sh][type="hidden"]', function() { // Hidden Field
        shSendNum(this);
    });
    $(document).on("change", 'input[data-sh][type="time"]', function() { // Time
        shSendVal(this);
    });
    $(document).on("change", 'input[data-sh]:text', function() { // Text
        shSendVal(this);
    });
    $(document).on("change", 'textarea[data-sh]', function() { // Textarea
        shSendVal(this);
    });
    $(document).on("change", 'input[data-sh][type="checkbox"]', function() { // Checkbox
        shSendCheckbox(this);
    });
    $(document).on("change", 'input[data-sh][type="radio"]', function() { // Radio
        shSendRadio(this);
    });
};

function shLogUpdate(path, data) {
    var obj = $('[data-log="' + path + '"]');
    var max = parseInt($(obj).attr('data-max'));
    if (obj.length == 0) {
        console.log("unknown id: "+ path);
        return;
    }
    if (data.length > 1) {
        $(obj).html('')
    };
    for (var i = 0; i < data.length; i++) {
        $(obj).prepend("<li>" + data[i] + "</li>\n")
    };
    if (max != null) {
        while ($(obj).children().length > max) {
            $(obj).children().last().remove()
        };
    };
    $(obj).listview('refresh');
};


function shRRDUpdate(data) {
    var id, frame, rrds, item, value;
    if ('frame' in data) {
        id = data.id;
        var time = data.start * 1000;
        var step = data.step * 1000;
        var d = [];
        frame = data.frame;
        //{color: 'blue', label: data.label, yaxis: 2, data: []};
        for (i = 0; i < data.data.length; i++) {
            d.push([time, data.data[i]]);
            time += step
        };
        if (id in shRRD) {
            shRRD[id][frame]= d;
        } else {
            shRRD[id] = {};
            shRRD[id][frame] = d;
        };
        $.mobile.activePage.find($("[data-rrd]")).each(function() {
            rrds = $(this).attr('data-rrd').split('|');
            for (i = 0; i < rrds.length; i++) {
                rrd = rrds[i].split('=');
                if (rrd[0] == id) {
                    // incoming item found in current graph
                    frame = $(this).attr('data-frame')
                    if (id in shRRD) {
                        if (frame in shRRD[id]) {
                            shRRDDraw(this);
                        };
                    };
                    break;
                };
            };
        });
    } else {
        var time = data.time * 1000;
        for (item in data.data) {
            id = data.data[item][0];
            value = data.data[item][1];
            if (id in shRRD) {
                for (frame in shRRD[id]) {
                    if (frame.search(/^([0-9]+h)|([1-7]d)/) != -1) {
                        shRRD[id][frame].shift()  // remove 'oldest' element
                    };
                    shRRD[id][frame].push([time, value]);
                };
            };
        };
        $.mobile.activePage.find($("[data-rrd]")).each(function() {
            shRRDDraw(this);
        });
    };
};

function shRRDDraw(div) {
    var rrds = $(div).attr('data-rrd').split('|');
    var frame = $(div).attr('data-frame')
    var series = [];
    var options = {xaxis: {mode: "time"}};
    if ($(div).attr('data-options'))
        options = JSON.parse("{" + $(div).attr('data-options').replace(/'/g, '"') + "}") ;
    for (i = 0; i < rrds.length; i++) {
        var serie = {};
        rrd = rrds[i].split('=');
        var tid = rrd[0];
        if (tid in shRRD) {
            if (frame in shRRD[tid]) {
                if (rrd[1] != undefined) {
                    serie = JSON.parse("{" + rrd[1].replace(/'/g, '"') + "}") ;
                }else {
                    serie = {}
                };
                serie['data'] = shRRD[tid][frame]
                series.push(serie);
            };
        };
    };
    if (series.length > 0) {
        $.plot($(div), series, options);
    };
};

function shWsInit() {
    shWS = new WebSocket(shURL);
    shWS.onopen = function(){
        shSend([ 'SmartHome.py', 1 ]);
        shRequestData();
        $('.ui-dialog').dialog('close');
    };
    shWS.onmessage = function(event) {
        var path, val;
        var data = JSON.parse(event.data);
        console.log("receiving data: " + event.data);
        command = data[0];
        delete data[0];
        switch(command) {
            case 'item':
                for (var i = 1; i < data.length; i++) {
                    path = data[i][0];
                    val = data[i][1];
                    if ( data[i].length > 2 ) {
                        shOpt[path] = data[i][2];
                    };
                    shLock = path;
                    shBuffer[path] = val;
                    shUpdateItem(path, val);
                    shLock = false;
                };
                break;
            case 'rrd':
                shRRDUpdate(data[1]);
                break;
            case 'log':
                shLogUpdate(data[1][0], data[1][1]);
                break;
            case 'dialog':
                shDialog(data[1][0], data[1][1]);
                break;
        };
    };
    shWS.onerror = function(error){
        console.log('Websocket error: ' + error);
    };
    shWS.onclose = function(){
        shDialog('Network error', 'Could not connect to the backend!');
    };
};

function shWSCheckInit() {
    setInterval(shWSCheck, 2000);
};

function shWSCheck() {
    // check connection
    // if connection is lost try to reconnect
    if ( shWS.readyState > 1 ){ shWsInit(); };
};

function shRequestData() {
    shMonitor = $("[data-sh]").map(function() { if (this.tagName != 'A') { return $(this).attr("data-sh"); }}).add($("[data-sh-long]").map(function() { if (this.tagName != 'A') { return $(this).attr("data-sh-long"); }})).get();
    shMonitor = shUnique(shMonitor);
    shSend(['monitor', shMonitor]);
    $("[data-rrd]").each( function() {
        var rrds = $(this).attr('data-rrd').split('|');
        var frame = $(this).attr('data-frame');
        for (i = 0; i < rrds.length; i++) { 
            var rrd = rrds[i].split('=');
            var id = rrd[0];
            if (!(id in shRRD)) {
                shSend(['rrd', [rrd[0], frame]]);
            } else if (!(frame in shRRD[id])) {
                shSend(['rrd', [rrd[0], frame]]);
            };
        };
    });
    $("[data-log]").each( function() {
        var log = $(this).attr('data-log');
        var max = $(this).attr('data-max');
        if (!(log in shLog)) {
            shSend(['log', [log, max]]);
        };
    });
};
// page handling //
function shPageCreate() {
    console.log('PageCreate');
    shRequestData();
    // create dialog page
    if ($('#shDialog').length == 0) {
        $.mobile.pageContainer.append('<div data-role="page" id="shDialog"><div data-role="header"><h1 id="shDialogHeader"></h1></div><div data-role="content"><div id="shDialogContent"></div></div></div>');
    };
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
                    $(obj).data('long', true);

                    var fn = function() {
                        $(obj).data('timer', setTimeout(function() {
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

// outgoing data //
function shSend(data){
    // console.log("Websocket state: " + shWS.readyState);
    if ( shWS.readyState > 1 ){
        shWsInit();
    };
    if ( shWS.readyState == 1 ) {
        console.log('sending data: ' + data);
        shWS.send(unescape(encodeURIComponent(JSON.stringify(data))));
        return true;
    } else {
        console.log('Websocket (' + shURL + ') not available. Could not send data.');
        return false;
    };
};

function shBufferUpdate(path, val, src, enforce){
    if ( path in shBuffer) {
        if (shBuffer[path] !== val || enforce){
            console.log(path + " changed to: " + val + " (" + typeof(val) + ")");
            shBuffer[path] = val;
            shSend([ 'item', [ path, val ]]);
            shUpdateItem(path, val, src);
        };
    };
};

function shTriggerLogic(obj){
    shSend(['logic', [ $(obj).attr('data-logic'), $(obj).attr('value') ]]);
};

function shSwitchButton(obj){
    var path = $(obj).attr('data-sh');
    var val = true;
    if ( String($(obj).val()) == '1') {
        val = false;
    };
    shBufferUpdate(path, val, obj);
    $(obj).val(Number(val));
    $(obj).attr("src", shOpt[path][Number(val)]);
};

function shSendSelect(obj){
    var path = $(obj).attr('data-sh');
    if ( path == shLock) { return; };
    var val;
    if ($(obj).attr('data-role') == 'slider') { // toggle
        val = Boolean($(obj)[0].selectedIndex)
    } else { // regular select
        val = $(obj).val();
    };
    shBufferUpdate(path, val, obj);
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

function shSendPush(obj, val){
    var path = $(obj).attr('data-sh');
    if ( path == shLock) { return; };
    shBufferUpdate(path, val, obj);
};

function shSendVal(obj){
    var path = $(obj).attr('data-sh');
    if ( path == shLock) { return; };
    var val = $(obj).val();
    shBufferUpdate(path, val, obj);
};

function shSendNum(obj){
    var path = $(obj).attr('data-sh');
    if ( path == shLock) { return; };
    var val = Number($(obj).val());
    shBufferUpdate(path, val, obj);
};

function shSendRadio(obj){
    var path = $(obj).attr('data-sh');
    if ( path == shLock) { return; };
    var val = $(obj).val();
    shBufferUpdate(path, val, obj);
};

function shSendCheckbox(obj){
    var path = $(obj).attr('data-sh');
    if ( path == shLock) { return; };
    var val = $(obj).prop('checked');
    shBufferUpdate(path, val, obj);
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

function updateSelect(obj, val) {
    if ($(obj).attr('data-role') == 'slider') { // toggle
        obj.selectedIndex = val;
        try {
            $(obj).slider("refresh");
        } catch (e) {};

    } else { // select
        $(obj).val(val);
        try {
            $(obj).selectmenu("refresh");
        } catch (e) {};
    };
};

function updateList(obj, val) {
    $(obj).html('')
    for (var i = 0; i < val.length; i++) {
        $(obj).append("<li>" + val[i] + "</li>\n")
    };
    $(obj).listview('refresh');

};

function updateInput(obj, val) {
    var type = $(obj).attr('type');
    if (type == undefined) {
        type = $(obj).attr('data-type');
    }
    //console.log('type: '+ type);
    switch(type) {
        case 'text': // regular text
            $(obj).val(val);
            break;
        case 'range': // slider
            try {
                $(obj).val(val).slider("refresh");
            } catch (e) {};
            break;
        case 'number': // ?
            try {
                $(obj).val(val).slider("refresh");
            } catch (e) {};
            break;
        case 'checkbox': // checkbox
            try {
                $(obj).attr("checked",val).checkboxradio("refresh");
            } catch (e) {};
            break;
        case 'image': // image
            $(obj).val(Number(val));
            $(obj).attr("src", shOpt['example.toggle'][Number(val)]); // XXX
            break;
        case 'time': // time
            $(obj).val(val);
            break;
        default:
            console.log("unknown type: " + type);
            break;
    };
};

function shDialog(header, content){
    $('#shDialogHeader').html(header);
    $('#shDialogContent').html(content);
    //$('#shDialog').trigger('create');
    $.mobile.changePage('#shDialog', {transition: 'pop', role: 'dialog'} );
};
