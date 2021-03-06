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

var shVersion = 0.8;
var shProto = 1;
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

if (typeof String.prototype.startsWith != 'function') {
  String.prototype.startsWith = function (str){
    return this.slice(0, str.length) == str;
  };
}

function shPushCycle(obj, timeout, value) {
    shSendPush(obj, value);
    $(obj).data('cycle', setTimeout(function(){shPushCycle(obj, timeout, value)}, timeout));
};

function shInit(url) {
    // Init WebSocket
    shURL = url;
    shWsInit();
    setTimeout(shWSCheckInit, 2000);
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
        var value = true;
        var cycle = $(this).attr('data-cycle');
        if (cycle == undefined) {
            cycle = 1000;
        } else {
            cycle = parseInt(cycle);
        };
        var arr = $(this).attr('data-arr');
        if (arr != undefined) {
            value = [parseInt(arr), 1];
        };
        var path = $(this).attr('data-sh');
        shPushCycle(this, cycle, value);
    });
    $(document).on("vmouseup", 'img.push[data-sh]', function() { // Push Button
        clearTimeout($(this).data('cycle'))
        var value = false;
        var arr = $(this).attr('data-arr');
        if (arr != undefined) {
            value = [parseInt(arr), 0];
        };
        var path = $(this).attr('data-sh');
        shSendPush(this, value);
    });
    $(document).on("change", 'select[data-sh]', function() { // Select
        shSendSelect(this);
    });
    $(document).on("slidestop", 'input[data-sh][data-type="range"]', function() { // Slider
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

function shLogUpdate(data) {
    var path, obj, max, val;
    for (var i = 0; i < data.p.length; i++) {
        path = data.p[i][0];
        obj = $('[data-log="' + path + '"]');
        if (obj.length == 0) {
            console.log("unknown id: "+ path);
            return;
        }
        val = data.p[i][1];
        if ('i' in data) {  // init
            $(obj).html('')
        };
        for (var j = val.length -1; j >= 0; j--) {
            $(obj).prepend(val[j] + "\n")
        };
        max = $(obj).attr('data-max');
        if (max != undefined) {
            max = parseInt(max);
            while ($(obj).children().length > max) {
                $(obj).children().last().remove()
            };
        };
        $(obj).listview('refresh');
    };
};


function shRRDUpdate(data) {
    var id, time, step, frame, rrds, item, value;
    if ('f' in data) {
        id = data.p[0][0];
        time = data.s * 1000;
        step = data.d * 1000;
        var d = [];
        frame = data.f;
        //{color: 'blue', label: data.label, yaxis: 2, data: []};
        for (i = 0; i < data.p[0][1].length; i++) {
            d.push([time, data.p[0][1][i]]);
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
        var time = data.t * 1000;
        for (item in data.p) {
            id = data.p[item][0];
            value = data.p[item][1];
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
                } else {
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
        shSend({'k': 'p', 'v': shProto});
        shRRD = {};
        shLog = {};
        shRequestData();
        $('.ui-dialog').dialog('close');
    };
    shWS.onmessage = function(event) {
        // msg format
        // k (ey) = i(tem)|l(og)|r(rd)|d(ialog)
        // p (aylod) = array with [id, value] arrays
        // rrd: f (rame), s (tart), d (elta)
        var path, val;
        var data = JSON.parse(event.data);
        console.log("receiving data: " + event.data);
        switch(data.k) {
            case 'i':
                for (var i = 0; i < data.p.length; i++) {
                    path = data.p[i][0];
                    val = data.p[i][1];
                    if ( data.p[i].length > 2 ) {
                        shOpt[path] = data.p[i][2];
                    };
                    shLock = path;
                    shBuffer[path] = val;
                    shUpdateItem(path, val);
                    shLock = false;
                };
                break;
            case 'r':
                shRRDUpdate(data);
                break;
            case 'l':
                shLogUpdate(data);
                break;
            case 'd':
                shDialog(data.h, data.c);
                break;
            case 'u':
                shUrl(data.u);
                break;
            case 'p':
                var proto = parseInt(data['p']);
                if (proto != shProto) {
                    shDialog('Protcol missmatch', 'Update smarthome(.min).js');
                };
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
    shMonitor = $("[data-sh]").map(function() { if (this.tagName != 'A') { return $(this).attr("data-sh"); }}).get();
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
};

function shPageShow() {
    // check connection
    if ( shWS.readyState > 1 ){ // Socket closed
        shWsInit();
    };
    $.mobile.activePage.find($("[data-rrd]")).each(function() {
        shRRDDraw(this);
    });
};

// outgoing data //
function shSend(data){
    // console.log("Websocket state: " + shWS.readyState);
    if ( shWS.readyState > 1 ){
        shWsInit();
    };
    if ( shWS.readyState == 1 ) {
        console.log('sending data: ' + JSON.stringify(data));
        shWS.send(unescape(encodeURIComponent(JSON.stringify(data))));
        return true;
    } else {
        console.log('Websocket (' + shURL + ') not available. Could not send data.');
        return false;
    };
};

function shBufferUpdate(path, val, src){
    if ( path in shBuffer) {
        if (shBuffer[path] !== val){
            console.log(path + " changed to: " + val + " (" + typeof(val) + ")");
            shBuffer[path] = val;
            shSend({'k': 'i', 'p': path, 'v': val});
            shUpdateItem(path, val, src);
        };
    };
};

function shTriggerLogic(obj){
    shSend({'k':'c', 'l': $(obj).attr('data-logic'), 'v': $(obj).attr('value')});
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
    shBufferUpdate(path, val, obj);
};

function shSendPush(obj, val){
    var path = $(obj).attr('data-sh');
    if ( path == shLock) { return; };
    shSend({'k': 'i', 'p': path, 'v': val});
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
                var unit = $(obj).attr('data-unit');
                if (unit != null) {
                    val = val + ' ' + unit
                };
                $(this).html(val);
                break;
            case 'SPAN':
                var unit = $(obj).attr('data-unit');
                if (unit != null) {
                    val = val + ' ' + unit
                };
                $(this).html(val);
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
                if ( $(this).attr("class") != "set" && $(this).attr("class") != "push"){
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
        if (val[i].startsWith('<li')) {
            $(obj).append(val[i] + "\n")
        } else {
            $(obj).append("<li>" + val[i] + "</li>\n")
        };
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
function shUrl(url){
    document.location.href=url;
};
