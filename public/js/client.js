var BLACKLIST = [];
// ------------------------------------------------------------------
// Client
// ------------------------------------------------------------------

// Create list of online users
ONLINE = new Backbone.Collection();

//Array shortcut [Array.last()]
Array.prototype.last = function(){return this[this.length-1]}

$(function() {
    var CLIENT_RECAPTCHA_KEY = "6Lcw6wcTAAAAANJlc4WS4P4uecBjcLjW7jtHrZCm";
    var socket = io('/' + window.channel);
    var roles = ['god','super','admin','mod','basic','mute'];

    //Add user to list and show message
    socket.on('join', function(user) {
        ONLINE.add(user);
        if (CLIENT.get('join') == 'on') {
            CLIENT.show({
                type : 'general-message',
                message : user.nick + ' has joined '
            });
        }

        if (CLIENT.has('part')) {
            socket.emit('SetPart', CLIENT.get('part'));
        }
    });

    //Synchronize user list with server
    socket.on('online', function(users) {
        ONLINE.add(users);
    });

    //Shows user leave message with part, if it exists
    socket.on('left', function(user) {
        ONLINE.remove(user.id);
        if (!user.kicked && CLIENT.get('join') == 'on') {
            CLIENT.show({
                type : 'general-message',
                message : user.nick + ' has left ' + (user.part || '')
            });
        }
    });

    //Triggers name change message
    socket.on('nick', function(info) {
        var user = ONLINE.get(info.id);
        var old = user.get('nick');
        user.set('nick', info.nick);
        CLIENT.show({
            type : 'general-message',
            message : old + ' is now known as ' + info.nick
        });
    });

    //Updates user information
    socket.on('update', function(info) {
        if (info.role == 'mute') {
            info.role = 'basic';
            info.idle = 1;
        }
        CLIENT.set(info);
    });

    //Updates the large center 'message'
    socket.on('centermsg', function(data) {
        CLIENT.set('msg', data.msg);
    });

    //Client side check to see if user is active
    socket.on('alive', function() {
        socket.emit('alive');
    });

    //Plays youtube video when activated
    socket.on('playvid', function(url){
        if(url.url == "stop" || CLIENT.get('mute') == 'on' || CLIENT.get('play') == 'off') {
            $("#youtube")[0].innerHTML = "";
        } else {
            $("#youtube")[0].innerHTML = "<iframe width=\"420\" height=\"345\" src=\"https://www.youtube.com/embed/" + url.url +"?autoplay=1\" frameborder=\"0\" allowfullscreen></iframe>";
        }
    });

    //Shows messages from users that aren't blocked
    socket.on('message', function(msg) {
        if (!msg.nick) {
            CLIENT.show(msg);
        } else {
            var list = _.map(CLIENT.get('block'), function(value){
                return value.toLowerCase();
            });
            if (list.indexOf(msg.nick.toLowerCase()) == -1) {
                CLIENT.show(msg);
            }
        }
    });

    //Sends user info after connecting to the server
    socket.on('connect', function() {
        socket.emit('join', {
            nick : CLIENT.get('nick'),
            security : CLIENT.get('security')
        });
    });

    //Displays disconnect message... that's really all.
    socket.on('disconnect', function() {
        ONLINE.reset();
        CLIENT.error('Disconnected');
    });

    //Refreshes window on command
    socket.on('refresh', function() {
        window.location.reload();
    });

    //Sends request for topic info
    getTopicData = function() {
        socket.emit('topicInfo');
    };

    //Sends request for user's flair information
    sendFlair = function(flair){
        socket.emit('command', {
            name : 'flair',
            params : {flair : flair}
        });
    };
    socket.on('updateMousePosition', function(msg) {
        CLIENT.trigger('updateMousePosition', msg);
    });
    /**
     * @inner
     * @param {string} name
     * @param {string} input
     * @param {Array.<string>} expect
     */
    function parseParams(name, input, expect) {
        if ('pm block alert unblock unalert'.split(' ').indexOf(name) != -1 && input.trim() == ""){
            CLIENT.error('Invalid: /'+name+' <nick>');
        } else {
        //Simplified switch statement for client-side commands
            switch(name) {
                case 'pm':
                    var pm = /^(.*?[^\\])\|([\s\S]*)$/.exec(input);
                    if (pm) {
                        var nick = pm[1].replace('\\|', '|');
                        return {
                            nick : nick,
                            message : pm[2],
                        };
                    }
                    break;
                case 'block':
                case 'alert':
                    add(name, input.trim());
                    break;
                case 'unblock':
                case 'unalert':
                    remove(name.substring(2),input.trim());
                    break;
                case 'kick':
                case 'ban':
                case 'permaban':
                case 'speak':
                    var pm = /^(.*?[^\\])(?:\|([\s\S]*))?$/.exec(input);
                    if (pm) {
                        var param1 = pm[1].replace('\\|', '|');
                        var param2 = pm[2]  || " ";
                        if(name == 'speak'){
                            return {
                                message : param1

                            };
                        } else {
                            return {
                                nick : param1,
                                message : param2
                            };
                        }
                    }
                    break;
                case 'global':
                    var msg = /([\s\S]*)?$/.exec(input);
                    return {
                        message : msg[0]
                    };
                    break;
                default:
                    var values = input.split(' ');
                    if (values[0] == '') {
                        values.shift();
                    }
                    var lastParam = _.last(expect);
                    if (lastParam && /\$$/.test(lastParam) && values.length > expect.length) {
                        var combine = values.splice(expect.length, values.length - expect.length).join(' ');
                        values[expect.length - 1] += ' ' + combine;
                    }
                    if (values.length == expect.length) {
                        var params = {};
                        values.forEach(function(param, i) {
                            params[expect[i].replace('$', '')] = param;
                        });
                        return params;
                    }
            }
        }
    }

    //Backbone model containing functions to manage the user chat interface
    CLIENT = new (Backbone.Model.extend({
        initialize : function() {
            /* Initialize from localstorage. */
            'color join font style mute mute_speak play nick images security flair styles bg access_level role part menu_top menu_left menu_display mask frame'.split(' ').forEach(function(key) {
                var item = localStorage.getItem('chat-' + key);
                this.set(key, item);
                this.on('change:' + key, function(m, value) {
                    if (value) {
                        localStorage.setItem('chat-' + key, value);
                    } else {
                        localStorage.removeItem('chat-' + key);
                    }
                });
            }, this);

            /* Notify when values change. */
            'color style flair mute play mute_speak images styles bg role access_level part mask frame'.split(' ').forEach(function(key) {
                this.on('change:' + key, function(m, value) {
                    if (value) {
                        this.show(key + ': ' + value);
                    } else {
                        this.show(key + ' reset to default');
                    }
                }, this);
            }, this);

            /* Display message sample to user */
            'color style font flair'.split(' ').forEach(function(key) {
                this.on('change:' + key, function(m, value) {
                    this.submit('/echo Now your messages look like this');
                }, this);
            }, this);
        },

        //Returns all valid commands
        getAvailableCommands : function() {
            var myrole = this.get('role');
            return myrole == null ? [] : _.filter(_.keys(COMMANDS), function(key) {
                var cmd_level = COMMANDS[key].role;
                return cmd_level == null || roles.indexOf(myrole) <= roles.indexOf(cmd_level);
            });
        },

        //Parses and sends message to server
        submit : function(input) {
            var access_level = parseInt(this.get('access_level'));
            var parsed = /^\/(\w+) ?([\s\S]*)/.exec(input);
            if (access_level < 0) access_level = 3;
            if (parsed) {
                var specs = parsed[2];
                var name = parsed[1].toLowerCase();
                var cmd = COMMANDS[name];
                if (cmd && roles.indexOf(this.get('role')) <= roles.indexOf(cmd.role || 'basic')) {
                    var expect = cmd.params || [];
                    var params = parseParams(name, specs, expect);
                    if (expect.length == 0 || params) {
                        var handler = typeof cmd == 'function' ? cmd : cmd.handler;
                        if (handler) {
                            handler(params);
                        } else {
                            socket.emit('command', {
                                name : name,
                                params : params
                            });
                        }
                    } else {
                        CLIENT.error('Invalid: /' + name + ' <' + expect.join('> <').replace('$', '') + '>');
                    }
                } else {
                    CLIENT.error('Invalid command. Use /help for a list of commands.');
                }
            } else {
                var input = this.decorate(input);
                var flair = this.get('flair');
                if (!this.get('idle')) {
                    socket.emit('message', {
                        flair : flair,
                        message : input
                    });
                } else {
                    CLIENT.show({
                        type : 'chat-message',
                        nick : this.get('nick'),
                        message : input,
                        flair : flair
                    });
                 }
            }
        },

        show : function(message) {
            this.trigger('message', message);
        },

        error : function(content) {
            this.trigger('message', {
                type: 'error-message',
                message: content
            });
        },

        //List of invalid fonts, so errors don't keep showing up
        badfonts : [],

        //Adds formating to incoming text
        decorate : function(input) {
            if (input.charAt(0) != '>' || input.search(/(^|[> ])>>\d+/) == 0
            || input.search(/>>>(\/[a-z0-9]+)\/(\d+)?\/?/i) == 0) {
                var style = this.get('style');
                var color = this.get('color');
                var font = this.get('font');
                if (style) {
                    style = style.replace(/\/\+/g, '');
                    if(style.split('/^').length > 4){
                        amount = style.split('/^').length;
                        for (i = 0; i < amount - 4; i++) {
                            style = style.replace(/\/\^/i, '');
                        }
                    }
                    input = style + input;
                }
                input = ' ' + input;
                color ? input = '#' + color + input + ' ' : input = input + ' ';
                if (font) {
                    input = '$' + font + '|' + input;
                }
            }
            return input;
        },

        updateMousePosition : function(position) {
            socket.emit('updateMousePosition', position);
        }
    }));
});

// ------------------------------------------------------------------
// Topic
// ------------------------------------------------------------------

$(function() {
    var blurred = false;
    var unread = 0;
    var check = new RegExp('\\b'+ CLIENT.get('nick') +'\\b',"gi");

    //Changes unread count
    function updateTitle() {
        var topic = CLIENT.get('topic');
        if (topic) {
            if (blurred && unread > 0) {
                document.title = '(' + unread + ') ' + topic.replace('\\n', '');
            } else {
                document.title = topic.replace('\\n', '');
            }
        }
    }
    $(window).blur(function() {
        blurred = true;
        unread = 0;
    });
    $(window).focus(function() {
        $("#icon").attr("href","../img/icon2.ico");
        blurred = false;
        updateTitle();
    });
    //Updates unread status
    CLIENT.on('message', function(message) {
        if (blurred) {
            if(message.message.search(check) != -1 || (message.type == 'personal-message' && message.nick != CLIENT.get('nick'))){
                $("#icon").attr("href","../img/icon.ico");
            }
            unread++;
            updateTitle();
        }
    });
    CLIENT.on('change:msg', function(m, msg){
        $('#content').html(parser.parse(msg));
    });
    //Show notification when it is updated
    CLIENT.on('change:notification', function(m, notification) {
        updateTitle();
        parser.getAllFonts(notification);
        CLIENT.show({
            type : 'note-message',
            message : notification
        });
    });
    //Same for the topic
    CLIENT.on('change:topic', function(m, topic) {
        updateTitle();
        CLIENT.show({
            type : 'general-message',
            message : 'Topic: ' + topic
        });
    });
    //Set the frame when it is changed
    CLIENT.on('change:frame_src', function(m) {
        var url = CLIENT.get('frame_src');
        if(CLIENT.get('frame') == 'on' && parser.linkreg.exec(url) && url){
            $('#messages').append("<div class=frame><iframe width=\"100%\" height=\"100%\" src=\"" + url + "\"frameborder=\"0\" sandbox=\"allow-same-origin allow-scripts\"></iframe></div>")
        } else if(url == "none") {
            $(".frame").remove();
        }
    });
    CLIENT.on('change:frame', function(){
        if(CLIENT.get('frame') == 'off'){
            $(".frame").remove();
        } else if(CLIENT.get('frame_src')){
            $('#messages').append("<div class=frame><iframe width=\"100%\" height=\"100%\" src=\"" + CLIENT.get('frame_src') + "\"frameborder=\"0\" sandbox=\"allow-same-origin allow-scripts\"></iframe></div>")
        }
    });
    //Turns play off
    CLIENT.on('change:play', function(){
        if(CLIENT.get('play') == 'off'){
            $("#youtube")[0].innerHTML = "";
        }
    });
    CLIENT.on('change:mute change:mute_speak', function(m, mute) {
        if (mute == 'on') {
            $('audio').each(function() {
                this.pause();
            });
        }
    });
});

// ------------------------------------------------------------------
// Theme
// ------------------------------------------------------------------

$(function() {
    CLIENT.on('change:background', function(m, background) {
        if (background && CLIENT.get('bg') == 'on' && background != 'default')
            $('#messages').css('background', background);
        CLIENT.set('old', background);
    });
    CLIENT.on('change:theme_style', function(m, theme_style) {
        if (theme_style) {
            $('body').attr("class", theme_style);
        } else {
            $('body').attr('class', '');
        }
    });
    CLIENT.on('change:bg', function(m, bg){
        if(bg == 'on'){
            $('#messages').css('background', CLIENT.get('old'));
        } else {
            $('#messages').css('background', 'url(/public/css/img/bg.png) center / auto 50% no-repeat rgb(17, 17, 17)');
        }
    });
    // Set the theme for scrollbar and input textarea
    CLIENT.on('change:chat_style', function(m, style){
        style = CLIENT.get('chat_style').split(',');
        if (!style[2])
            style[2] == '#000';
        $('#input-bar').css('background-color', style[0]);
        $('#user-list').css('background-color', style[2]);

        if(navigator.userAgent.toLowerCase().indexOf('chrome') > -1) {
            document.styleSheets[1].deleteRule(15);
            document.styleSheets[1].insertRule(".scrollbar_default::-webkit-scrollbar-thumb { border-radius: 5px; background: " + style[1] + "",15);
        }
    });

    // All attributes to set at init
    _.each(['images', 'bg', 'styles', 'frame', 'play', 'join'], function(e) {
        CLIENT.set(e, 'on');
    });
    _.each(['block', 'alert'], function(e) {
        CLIENT.set(e, []);
    });
});

// ------------------------------------------------------------------
// Online User Tracking
// ------------------------------------------------------------------

$(function() {

    //Updates menu user count
    function updateCount() {
        $('#tabbed-menu').text(ONLINE.size());
    }

    //Hides and shows popup user menu
    $('#tabbed-menu').click(function(){
    	var distanceFromTop = $("#tabbed-menu").offset().top - $(window).scrollTop()
    	if ( distanceFromTop < 350 ) {
    	    document.getElementById("user-list").style.bottom = "inherit";
    	}
    	else {
    	    document.getElementById("user-list").style.bottom = "50px";
    	}
    	$('#user-list').slideToggle();
    });
    $(document).on('focus', 'textarea', function() {// Fix for users with an OSK, such as mobile.
    	if ($('#user-list').css('display') == 'block') {
	    $('#user-list').slideToggle();
    	}
    });
    if (CLIENT.get('menu_display')){
        $('.menu-container').css('left',CLIENT.get('menu_left'));
        $('.menu-container').css('top',CLIENT.get('menu_top'));
    }
    //Adds user to the tabbed menu and updates count
    ONLINE.on('add', function(user) {
        var li = $('<li class="users"></li>').attr({
            class : 'online-' + user.get('id'),
            id : user.get('id')
        }).appendTo('.online');
        //Limit the maximum length to be displayed
        var nick = $('<span></span>').text(user.get('nick').substr(0,35)).appendTo(li);
        li.append(' ');
        user.on('change:nick', function() {
            nick.text(user.get('nick').substr(0,35));
        });
        CLIENT.on('change:menu_display', function(e) {
           updateCount();
        });
        updateCount();
    });
    //Remove user div from the menu
    ONLINE.on('remove', function(user) {
        $('.online-' + user.get('id')).remove();
        updateCount();
    });
    ONLINE.on('reset', function() {
        $('.online').html('');
    });
    $('#tabbed-menu-cotainer').draggable({
        revert: 'invalid',
        drag : function(){
            CLIENT.set('menu_left',$(this).css('left'));
            CLIENT.set('menu_top',$(this).css('top'));
        },
        containment: 'body'
    });

    $('#messages').droppable({
        accept: '#tabbed-menu-cotainer'
    });

    $('#input-bar').droppable({
        accept: '#tabbed-menu-cotainer',
        drop: function (event, ui) {
            //snap button into place
            $('#tabbed-menu-cotainer').css('top','8px');
            $('#tabbed-menu-cotainer').css('left','');
            $('#tabbed-menu-cotainer').css('right','0');
            //resize char-bar
            $('#input-message').css('width','calc(100% - 34px)');
        },
        out: function(event, ui){
            //expand chat-bar
            $('#input-message').css('width','100%');
        }
    });

    $.contextMenu({
        selector: '.online li',
        className: 'data-title',
        trigger: 'left',
        items: {
            //Removed until PM Panels are finished.
            /*"Panel" : {
                name: "PM Panel",
                callback: function(){

                }
            },*/
            "PM": {
                name: "PM",
                callback: function(){
                    $('#input-message').focus().val('').val('/pm ' + $.trim(this[0].textContent) + '|');
                }
            },
            "sep1": "---------",
            "Kick": {
                name: "Kick",
                callback: function(){
                    CLIENT.submit('/kick '+ $.trim(this[0].textContent));
                }
            },
            "Ban": {
                name: "Ban",
                callback: function(){
                    CLIENT.submit('/ban '+ $.trim(this[0].textContent));
                }
            },
            "Banip": {
                name : "Banip",
                callback: function(){
                    CLIENT.submit('/banip '+ $.trim(this[0].textContent));
                }
            },
            "sep2": "---------",
            "Block": {
                name: "Block",
                callback: function(){
                    CLIENT.submit('/block '+this[0].textContent);
                }
            },
            "UnBlock": {
                name: "UnBlock",
                callback: function(){
                    CLIENT.submit('/unblock '+this[0].textContent)
                }
            },
            "Whois": {
                name: "Whois",
                callback: function(){
                    CLIENT.submit('/whois ' + $.trim(this[0].textContent));
                }
            }
        }
    });

    $('.online').click(function(e){
        $('.data-title').attr('data-menutitle', e.target.textContent);
    });
});

// ------------------------------------------------------------------
// Messages
// ------------------------------------------------------------------

$(function() {
    var DATE_FORMAT = 'shortTime';
    var roles = ['god','super','admin','mod','basic','mute'];

    //Creates message to be displayed
    CLIENT.on('message', function(message) {
        if (typeof message == 'string') {
            message = {
                message : message
            };
        }
        message.type = message.type || 'system-message';
        var el = buildMessage(message);
        switch (message.type) {
        /*
         * case 'personal-message': PM.show(message, el); break;
         */
        default:
            appendMessage(el);
            break;
        }
    });

    //Builds message depending on type
    function buildMessage(message) {
        var el = $('<div class="message"></div>');
        var sound = 'message';
        var content, valid;
        el.addClass(message.type);
        var time = [new Date(), new Date(message.time)][+ !!message.time];
        var check = new RegExp('\\b'+ CLIENT.get('nick') +'\\b','gi');
        var alert = CLIENT.get('alert');
        //Check if msg contains any keywords
        for (var i = 0; i < alert.length; i++) {
            if (message.message.indexOf(alert[i]) != -1) {
                valid = true;
                break;
            }
        }
        if (message.type == 'personal-message') {
            if (message.nick != CLIENT.get('nick')) {
                CLIENT.lastNick = message.nick;
            }
            window.PM.show(message, message.from);
        }
        //Make quotable if relevant
        if (message.count){
            el.append($('<div class="timestamp" title=' + message.count + '></div>').text(time.format(DATE_FORMAT) + ' ' + message.count + ' '));
            content = $('<div class="message-content spooky_msg_' + message.count + '"></div>').appendTo(el);
        } else {
            el.append($('<div class="timestamp"></div>').text(time.format(DATE_FORMAT) + ' '));
            content = $('<div class="message-content"></div>').appendTo(el);
        }
        if (CLIENT.get('timestamp') == 'off') {
            el.children().first().css('visibility','hidden');
            el.children().first().css('font-size','0.2em');
        }
        //Alert the user if their name is mentioned
        if ((check.test(message.message.replace('\\','')) || valid) && message.nick != CLIENT.get('nick') && ('chat-message action-message personal-message'.split(' ').indexOf(message.type) + 1)){
            	message.count && el.children('.timestamp').attr('class', "timestamp highlightname");
            	sound = 'name'
        }
        //Alert user if they are quoted
        if ((message.message.search(/>>(\d)+/g) + 1) && CLIENT.get('nick') != message.nick) {// <--- Not a typo
            var matches = message.message.match(/>>(\d)+/g);
            for (var i = 0, j = matches.length; i < j; i++) {
                var lastQuote = $('.spooky_msg_'+matches[i].substring(2)).last();
                if (lastQuote.length && lastQuote.text().match(/[^:]*/i)[0] == CLIENT.get('nick')) {
                    message.count && el.children('.timestamp').attr('class', "timestamp highlightname");
                    sound = 'name';
                }
            }
        }
        if (message.nick) {
            var parsedFlair = parser.parse(message.flair);
            if (message.flair && parser.removeHTML(parsedFlair) == message.nick) {
                parser.getAllFonts(message.flair);
            } else if (message.flair) {
                parsedFlair = null;
            }
            if (message.hat != 'nohat' && message.type == 'chat-message') {
                $('<span class="hat ' + message.hat + '" style="background:url(\'/css/img/hats/'+message.hat+'.png\') no-repeat center;background-size: 30px 30px;"></span>').appendTo(content);
            }
            var flair = parsedFlair || message.nick;
            if (message.type == 'spoken-message') flair += ':';
            $('<span class="nick"></span>').html(flair).appendTo(content);
        }
        if (message.message) {
            var parsed;
            switch (message.type) {
                case 'escaped-message':
                    parsed = $('<span></span>').text(message.message).html().replace(/\n/g, '<br/>');
                    break;
                case 'personal-message':
                case 'chat-message':
                    parser.getAllFonts(message.message);
                    parsed = parser.parse(message.message);
                    break;
                case 'elbot-response':
                    parsed = message.message;
                    break;
                case 'general-message':
                case 'note-message':
                case 'error-message':
                    parsed = parser.parse(message.message);
                    break;
                case 'anon-message':
                    var name = (!CLIENT.get('role') || roles.indexOf(CLIENT.get('role'))) > 1 ? 'anon' : message.name;
                    parsed = parser.parse( '#6464C0' + name + ': ' + message.message);
                    break;
                default:
                    parsed = parser.parseLinks(message.message);
                    break;
            }
            $('<span class="content"></span>').html(parsed || message.message).appendTo(content);
        }
        //Load and play speak messages
        if (message.type == 'spoken-message' && CLIENT.get('mute') != 'on' && CLIENT.get('mute_speak') != 'on') {
            //var voices = ['default','yoda', 'old', 'loli', 'whisper', 'badguy'];
            var uri = message.source || ('http://tts.peniscorp.com/speak.lua?' + encodeURIComponent(message.message));
            var html = [ '<embed src="', uri, '" hidden="true" autoplay>' ].join('');
			var html = [ '<audio autoplay="autoplay"><source src="', uri, '" type="audio/wav"></source></audio>' ].join('');
            var $audio = $(html).appendTo('body');
            var audio = $audio[0];
            audio.onerror = audio.onpause = function(e) {
                $audio.remove();
            }
        }
        playAudio(sound);
        return el;
    }

    window.scrollToBottom = function() {
        var containerEl = $('#messages');
        var scrollDelta = containerEl.prop('scrollHeight') - containerEl.prop('clientHeight');
        containerEl.stop().animate({
            scrollTop : scrollDelta
        }, 100);
    }

    function appendMessage(el) {
        var containerEl = $('#messages');
        var scrolledToBottom = containerEl.prop('scrollTop') + containerEl.prop('clientHeight') >= containerEl.prop('scrollHeight') - 50;
        el.appendTo(containerEl);
        var scrollDelta = containerEl.prop('scrollHeight') - containerEl.prop('clientHeight');
        if (scrolledToBottom && scrollDelta > 0) scrollToBottom();
    }

    window.imageError = function(el) {
        var $el = $(el);
        var src = $el.attr('src');
        $el.replaceWith($('<a target="_blank"></a>').attr('href', src).text(src));
    }
});

//Quotes any clicked message and formats it as needed
$('#messages').on('click', '.message .timestamp', function(e){
    var number = e.currentTarget.title;
    if (number.length) {
        var textBox = $('#input-message');
        var value = textBox.val();
        var space = value && value.split(' ').last() ? ' ' : '';
        textBox.focus().val(value + space + '>>' + number + ' ');
    }
});

// ------------------------------------------------------------------
// PM Panel
// ------------------------------------------------------------------

//Soon to be in use
(function() {
    PANELS = {};
    PM = {
        show : function(message, id) {
            var nick = ONLINE.get(id).get('nick');
            var panel = PANELS[nick];
            if(panel){
                $(panel).append('<div id="PM-wrap"><span>' + message.nick + ': </span>' + '<span>' + parser.parse(message.message) + '</span></div>');
            }
        },
        create : function(id) {
            var pan = $('<div>');
            $('body').append(pan);
            $(pan).attr({
                id : 'panel-' + id,
                title : 'PM: ' + ONLINE.get(id).get('nick')
            });
            $(pan).css({
               position: 'absolute',
               width: '200px',
               height: '200px',
               backgroundColor: 'black',
               zIndex: '50'
            }).draggable().resizable();

            $(pan).html('<div style="position:absolute;right:0;color:red;" onclick="$(\'#panel-'+id+'\').remove();">X</div><div class="pm-messages" style="width:100%;height:calc(100% - 48px);color:white;"></div></div><div id="input-bar"><div><input id="input-message" style="width:100%"></input></div></div>');

            var input = $('#panel-' + id + ' input');
            $(input).keydown(function(e){
                if (e.keyCode == 13){
                   CLIENT.submit('/pm ' + ONLINE.get(id).get('nick') + '|' + $(input).val());
                   $(input).val('');
                }
            });
            PANELS[ONLINE.get(id).get('nick')] = pan.find('.pm-messages');
            console.log(PANELS)
        }
    };
})();

// ------------------------------------------------------------------
// Input Box Shadow Color
// ------------------------------------------------------------------

$(function() {
    function setHighlightColor(color) {
        var textColor;
        if (color) {
            var i = color.lastIndexOf('#');
            i >= 0 ? textColor = color.substring(i + 1) : textColor = color;
            if (/([a-f]{6}|[a-f]{3})/i.test(textColor))
            	textColor = '#' + textColor;
        } else {
            textColor = '#888';
        }
        $('#input-message')[0].style.boxShadow = '0px 0px 12px ' + textColor;
        $('#input-message')[0].style.border = '1px solid ' + textColor;
    }

    var focused = false;
    $('#input-message').focus(function() {
        focused = true;
        setHighlightColor(CLIENT.get('color'));
    }).blur(function() {
        focused = false;
        this.style.boxShadow = '';
        $('#input-message')[0].style.border = '';
    });

    CLIENT.on('change:color', function(m, color) {
        focused && setHighlightColor(color);
    });
});

// ------------------------------------------------------------------
// Input Form / History
// ------------------------------------------------------------------

//Manage textarea inputs and actions
$(function() {
    var history = [];
    var historyIndex = -1;
    function submit() {
        var ac = $('#autocomplete');
        if (ac.length == 0 || ac.css('display') == 'none') {
            var text = input.val();
            text && CLIENT.submit(text);
            historyIndex = -1;
            history.push(text);
            input.val('');
        }
    }
    var input = $('#input-message').keydown(function(e) {
        var delta = 0;
        switch (e.keyCode) {
        case 13: // enter
            if (!e.shiftKey) {
                e.preventDefault();
                var text = input.val();
                text && submit();
                historyIndex = -1;
                history.push(text);
                input.val('');
            }
            return;
        case 38: // up
            if(e.shiftKey){
                if ($(this).val().indexOf('\n') == -1 || $(this)[0].selectionStart < $(this).val().indexOf('\n')) {
                    delta = 1;
                }
            }
            break;
        case 40: // down
            if(e.shiftKey){
                if ($(this)[0].selectionStart > $(this).val().lastIndexOf('\n')) {
                    delta = -1;
                }
            }
            break;
        }
        if (delta) {
            historyIndex = Math.max(0, Math.min(history.length - 1, historyIndex + delta));
            text = history[history.length - historyIndex - 1];
            if (text) {
                e.preventDefault();
                input.val(text);
            }
        }
    });

    var ctrl = false;
    var hover;

    //Make images larger when hovering with ctrl
    $(document).keydown(function(e){
        if (e.keyCode == 17 && hover){
            if (hover.localName == 'img'){
                $('#bigimg')[0].innerHTML = hover.outerHTML;
                $('#bigimg').children().removeAttr('onload');
            }
            ctrl = true;
        }
    })

    $(document).keyup(function(e){
        if (e.keyCode == 17){
            ctrl = false;
            $('#bigimg')[0].innerHTML = '';
        }
    })

    $('#messages').on('mousemove', function(e) {
        hover = e.target;
        if(hover.localName == 'img' && ctrl){
            $('#bigimg')[0].innerHTML = hover.outerHTML;
            $('#bigimg').children().removeAttr('onload');
        } else {
            $('#bigimg')[0].innerHTML = '';
        }
    });

    //Resize textarea on keyup
    var input = $('#input-message').keyup(function(e) {
        input.css('height', '1px');
        input.css('height', Math.min(Math.max(input.prop('scrollHeight') + 4, 20), $(window).height() / 3) + 'px');
    });

});



// ------------------------------------------------------------------
// Commands
// ------------------------------------------------------------------

(function() {
    //Object with all commands. For more information see ch4t.io/help
    window.COMMANDS = {
        help : function() {
            CLIENT.show({
            	type : 'system-message',
                message : 'Available Commands: /' + CLIENT.getAvailableCommands().join(', /')
            });
        },
        nick : {
            params : [ 'nick$' ]
        },
        me : {
            params : [ 'message$' ]
        },
        login : {
            params : [ 'password', 'nick$' ]
        },
        register : {
            params : [ 'initial_password' ]
        },
        change_password : {
            params : [ 'old_password', 'new_password' ]
        },
        banlist : {
            role : 'admin'
        },
        permabanlist : {
            role : 'admin'
        },
        find : {
            role : 'admin',
            params : [ 'remote_addr' ]
        },
        permaban : {
            role : 'admin',
            params : [ 'nick[|message]' ]
        },
        unpermaban : {
            role : 'admin',
            params : [ 'id$' ]
        },
        ban : {
            role : 'admin',
            params : [ 'nick[|message]' ]
        },
        unban : {
            role : 'admin',
            params : [ 'id$' ]
        },
        unban_all : {
            role : 'god'
        },
        banip : {
            role : 'admin',
            params : [ 'nick$' ]
        },
        kick : {
            role : 'mod',
            params : [ 'nick[|message]' ]
        },
        access : {
            role : 'admin',
            params : [ 'role', 'access_level', 'nick$' ]
        },
        access_global : {
            role : 'god',
            params : [ 'access_level', 'nick$' ]
        },
        whois : {
            params : [ 'nick$' ]
        },
        findalt : {
            role : 'super',
            params : [ 'nick$' ]
        },
        topic : {
            role : 'mod',
            params : [ 'topic$' ]
        },
        note : {
            role : 'admin',
            params : [ 'message$' ]
        },
        clear : function() {
            // Clear #messages and add the /msg element back.
            $('#messages').empty().append("<table id='sam'><tr><td id='content'></td></tr></table>");
        },
        unmute : function() {
            CLIENT.set('mute', 'off');
        },
        mute : function() {
            CLIENT.set('mute', 'on');
        },
        style : {
            params : [ 'style$' ],
            handler : function(params) {
                var test = params.style;
                CLIENT.set('style', [test][+ (test == 'default' || test == 'none')]);
            }
        },
        font : {
            params : [ 'font$' ],
            handler : function(params) {
                var old = CLIENT.get('font');
                if (params.font == 'default' || params.font == 'none') {
                    CLIENT.unset('font');
                } else if (CLIENT.badfonts.indexOf(params.font) < 0) {
                    $.ajax({
                        url : 'https://fonts.googleapis.com/css?family=' + encodeURIComponent(params.font),
                        success : function(){CLIENT.set('font', params.font);},
                        error : function(){CLIENT.badfonts.push(params.font);CLIENT.error('That is not a valid font');}
                    });
                }
            }
        },
        color : {
            params : [ 'color' ],
            handler : function(params) {
                if (params.color == 'default' || params.color == 'none') {
                    CLIENT.set('color', null);
                } else if (parser.isColor(params.color)){
                    CLIENT.set('color', params.color);
                } else {
                    CLIENT.error('I don\'t think that is a color. http://en.wikipedia.org/wiki/Web_colors');
                }
            }
        },
        flair : {
            role: 'basic',
            params : [ 'flair$' ],
            handler : function(params) {
                if (params.flair == 'default' || params.flair == 'none') {
                    flair = null;
                }
                flair = params.flair.replace(/&/g, '\\&')
                sendFlair(flair);
                CLIENT.set('flair', flair);
            }
        },
        echo : {
            params : [ 'message$' ],
            handler : function(params) {
                CLIENT.show({
                    type : 'chat-message',
                    nick : CLIENT.get('nick'),
                    message : CLIENT.decorate(params.message),
                    flair : CLIENT.get('flair')
                });
            }
        },
        pm : {
            params : [ 'nick|message' ]
        },
        r : {
            params : [ 'message$' ],
            handler : function(params){
            	var last = CLIENT.lastNick;
                if (last){
                    CLIENT.submit("/pm "+last+"|"+params.message);
                } else {
                    CLIENT.error('You have not PMed anyone yet')
                }
            }
        },
        refresh : {role : 'super'},
        bg : {
            role : 'mod',
            params : [ 'theme_style$' ]
        },
        theme : {
            role : 'mod',
            params : [ 'input_style', 'scrollbar_style', 'menu_style' ]
        },
        reset : {
            role : 'super',
            params : [ 'nick' ]
        },
        get : {
            params : [ 'attribute' ],
            handler : function(params) {
                var attribute = params.attribute;
                var valid = 'theme color font style flair mute mute_speak play images note topic styles bg part block background mask msg alert security frame frame_src join'.split(' ');
                if (valid.indexOf(attribute) > -1) {
                    switch (attribute) {
                        case 'note':
                            attribute = 'notification';
                            break;
                        case 'bg':
                            attribute = 'background';
                            break;
                        case 'topic':
                            getTopicData();
                    }
                    if (attribute == 'theme') {
                        var input_msg_clr = $("#input-bar").css('backgroundColor');
                        var scroll_bar_clr = $(".scrollbar_default").css('backgroundColor');
                        var user_list_clr = $("#user-list").css('backgroundColor');

                        function rgb2hex(rgb) {
                            rgb = rgb.substring(4, rgb.length-1).split(", ");
                            function colorChange(color) {
                                var color = parseInt(color).toString(16);
                                return ['', '0'][+ (color.length < 2)] + color;
                            }

                            var red = colorChange(rgb[0]);
                            var green = colorChange(rgb[1]);
                            var blue = colorChange(rgb[2]);
                            return "#"+red+green+blue;
                        }
                        theme_setting = rgb2hex(input_msg_clr) + " " +
    			        rgb2hex(scroll_bar_clr)+ " " +
    			        rgb2hex(user_list_clr) + " ";

                        CLIENT.show({
                            type : 'system-message',
                            message : "Theme is currently set to: " + theme_setting
                        });
                        /*\
                        |*| I had to do this because of some genius bloat
                        |*| code one of you goof balls wrote long ago.  <3
                        \*/
                    } else {
                        var att = CLIENT.get(attribute)|| 'none';
                        if ((attribute == 'block' || attribute == 'alert') && !att.length) att = '[]';
                        CLIENT.show({
                            type : 'escaped-message',
                            message : params.attribute + ' is currently set to: ' + att
                        });
                    }
                } else {
                    CLIENT.error('Invalid: Variable can be one of [' + valid.join(', ') + ']');
                }
            }
        },
        speak : {
            params : [ 'message' ]
        },
        elbot : {
            params : [ 'message$' ]
        },
        anon : {
            params : [ 'message$' ]
        },
        part : {
            params : [ 'message$' ]
        },
        toggle : {
            params : [ 'att' ],
            handler : function(params) {
                var att = params.att;
                var toggled;
                switch (att) {
                    case 'bg':
                        toggled = 'bg'
                        break;
                    case 'join':
                    case 'leave':
                        var join_off = (CLIENT.get('join') == 'off');
                        CLIENT.show('Join and leave mesages ' + (join_off ? 'enabled' : 'disabled'));
                        toggled = 'join';
                        break;
                    case 'speak':
                    case 'mute_speak':
                        toggled = 'mute_speak';
                        break;
                    default:
                        if (att != 'style' && att != 'font') toggled = att;
                }
                // Uses unary operator (+)
                CLIENT.set(toggled, ['on', 'off'][+ (CLIENT.get(toggled) == 'on')]);
            }
        },
        private : {
            role : 'super'
        },
        public : {
            role : 'super'
        },
        invite : {
            role : 'super',
            params : [ 'nick' ]
        },
        uninvite : {
            role : 'super',
            params : [ 'nick' ]
        },
        whitelist : {
            role : 'super'
        },
        play : {
            role : 'super',
            params : [ 'url' ]
        },
        safe : function(){
            CLIENT.set({
                bg: 'off',
                images: 'off',
                mute_speak: 'on',
                frame: 'off'
            });
        },
        unsafe : function(){
            CLIENT.set({
                bg: 'on',
                images: 'on',
                mute_speak: 'off',
                frame: 'on'
            });
        },
        msg : {
            params : [ 'message$' ]
        },
        mask : {
            params : [ 'vHost' ]
        },
        ghost : {
        	role : 'super'
        },
        global : {
            role : 'super',
            params : [ 'message' ]
        },
        lock : {
            role : 'admin',
            params : [ 'command', 'role', 'access_level' ]
        },
        user_list : {
            role : 'mod'
        },
        frame : {
            role : 'super',
            params : [ 'url' ]
        },
        channels : {
            role : 'super'
        },
        cam : function(){
            video('event', 'embed', 'http://162.219.26.75:12202/spooks')
        },
        define : {
            params : [ 'message$' ]
        },
        coinflip : {

        },
        hat : {
            params : [ 'hat' ]
        },
        hata : {
            role: 'super',
            params : [ 'nick', 'hat' ]
        },
        hatr : {
            role : 'super',
            params : [ 'nick', 'hat' ]
        },
        hatc : {
            role : 'super',
            params : [ 'nick', 'hat' ]
        },
        warn : {
            role : 'super'
        },
        e : { //Popup Embed
            role : 'super',
            params : [ 'url' ],
            handler : function(params) {
                var url = params.url
                if (url.substring(0, 4) !== 'http'){
                    var url = 'http://' + params.url
                } else {
                    video('event', 'embed', url);
                    //console.log(url);
                }
            }
        }
    };

    var command_data = {
        blank : [['logout', 'unregister', 'whoami'],//Server
        ['block', 'unblock', 'alert', 'unalert']],//Client
        options : [{}, function(){}]
    };

    // Initializes all empty objects
    _.each(command_data.blank, function(v, k) {
        _.each(v, function(value) {
            window.COMMANDS[value] = this[k];
        }, command_data.options);
    });
})();

// Add user to a list
add = function(att, user) {
    if (user.toLowerCase() != CLIENT.get('nick').toLowerCase()) {
        var block = CLIENT.get(att);
        if (typeof block !== "object") { block = [] }
        if (block.indexOf(user) == -1) {
            block.push(user);
            CLIENT.set(att, block);
            CLIENT.show(user + ' was added');
        } else {
            CLIENT.error('That nick is already added');
        }
    } else {
        CLIENT.error('You may not add yourself');
    }
}

// Remove user from a specified list
remove = function(att, user) {
    var block = CLIENT.get(att);
    var index = block.indexOf(user);
    if (index != -1) {
        block.splice(index, 1);
        CLIENT.show(user + ' was removed.');
        CLIENT.set(att, block);
    } else {
        CLIENT.error('That nick is not on the list');
    }
}

// ------------------------------------------------------------------
// Message Parser
// ------------------------------------------------------------------

//Used for quote display
var mouseX;
var mouseY;
//Message parser
parser = {
    linkreg : /(\/embed )?[a-z]+:[\/]+[a-z\d-]+\.[^\s<]+/gi,
    coloreg : '(?:alice|cadet|cornflower|dark(?:slate)?|deepsky|dodger|light(?:sky|steel)?|medium(?:slate)?|midnight|powder|royal|sky|slate|steel)?blue|(?:antique|floral|ghost|navajo)?white|aqua|(?:medium)?aquamarine|blue|beige|bisque|black|blanchedalmond|(?:blue|dark)?violet|(?:rosy|saddle|sandy)?brown|burlywood|chartreuse|chocolate|(?:light)?coral|cornsilk|crimson|(?:dark|light)?cyan|(?:dark|pale)?goldenrod|(?:dark(?:slate)?|dim|light(?:slate)?|slate)?gr(?:a|e)y|(?:dark(?:olive|sea)?|forest|lawn|light(?:sea)?|lime|medium(?:sea|spring)|pale|sea|spring|yellow)?green|(?:dark)?khaki|(?:dark)?magenta|(?:dark)?orange|(?:medium|dark)?orchid|(?:dark|indian|(?:medium|pale)?violet|orange)?red|(?:dark|light)?salmon|(?:dark|medium|pale)?turquoise|(?:deep|hot|light)?pink|firebrick|fuchsia|gainsboro|gold|(?:green|light(?:goldenrod)?)?yellow|honeydew|indigo|ivory|lavender(?:blush)?|lemonchiffon|lime|linen|maroon|(?:medium)?purple|mintcream|mistyrose|moccasin|navy|oldlace|olive(?:drab)?|papayawhip|peachpuff|peru|plum|seashell|sienna|silver|snow|tan|teal|thistle|tomato|wheat|whitesmoke',
    replink : 'ÃƒÂ©ÃƒÂ¤!#@&5nÃƒÂ¸ÃƒÂºENONHEInoheÃƒÂ¥ÃƒÂ¶',
    repslsh : 'ÃƒÂ¸ÃƒÂº!#@&5nÃƒÂ¥ÃƒÂ¶EESCHEInoheÃƒÂ©ÃƒÂ¤',
    fontRegex : /(\$|(&#36;))([\w \-\,Ã‚Â®]*)\|(.*)$/,
    multiple : function(str, mtch, rep) {
        var ct = 0;
        while (str.match(mtch) && ct++ < 9)
            str = str.replace(mtch, rep);
        return str;
    },
    loadedFonts : {},
    addFont : function(family) {
        if (!this.loadedFonts[family] && CLIENT.badfonts.indexOf(family) == -1) {
            this.loadedFonts[family] = true;
            //var protocol = 'https:' == document.location.protocol ? 'https' : 'http';
            //Again, more font checking
            var url = 'https://fonts.googleapis.com/css?family=' + encodeURIComponent(family);
            $.ajax({
                url : url,
                success : function(){$('<link rel="stylesheet" href="' + url + '">').appendTo('head');},
                error: function(){CLIENT.badfonts.push(family);}
            });
        }
    },
    getAllFonts : function(str) {
        var match;
        while (match = this.fontRegex.exec(str)) {
            str = str.replace(this.fontRegex, "$2");
            if (CLIENT.badfonts.indexOf(match[3]) == -1)
                this.addFont(match[3]);
        }
    },
    removeHTML : function(parsed) {
        return $('<span>' + parsed + '</span>').text();
    },
    convertToHTML : function(str) {
        str = str.replace(/\n/g, '\\n')
            .replace(/&/gi, '&amp;')
            .replace(/>/gi, '&gt;')
            .replace(/</gi, '&lt;')
            .replace(/"/gi, '&quot;')
            .replace(/#/gi, '&#35;')
        // Codes containing hashtags
            .replace(/\$/gi, '&#36;')
            .replace(/'/gi, '&#39;')
            .replace(/~/gi, '&#126;')
            .replace(/\\\\n/g, this.repslsh)
            .replace(/\\n/g, '<br />')
            .replace(this.repslsh, '\\\\n');
        return str;
    },
    //Shorter version of parse
    parseLinks : function(str) {
        // Add HTML codes
        str = this.convertToHTML(str);
        // Remove replacement codes
        str = str.replace(RegExp(this.replink, 'g'), '');
        str = str.replace(RegExp(this.repslsh, 'g'), '');
        // Parse links
        var links = [];
        var prestr= "";
        var poststr = str;
        var index;
        while (poststr.search(/https?:\/\//i) != -1){
            index = poststr.search(/https?:\/\//i);
            prestr += poststr.substring(0, index);
            poststr = poststr.substring(index);
            if (poststr.search(this.linkreg) != -1){
                links.push(poststr.match(this.linkreg)[0]);
                poststr = poststr.replace(poststr.match(this.linkreg)[0],this.replink);
            } else {
                prestr += poststr.substring(0,poststr.match(/https?:\/\//i)[0].length);
                poststr = poststr.substring(poststr.match(/https?:\/\//i)[0].length);
            }
            str = prestr + poststr;
        }
        var escs = str.match(/\\./g);
        str = str.replace(/\\./g, this.repslsh);
        // Replace escapes
        for (i in escs)
            str = str.replace(this.repslsh, escs[i][1]);
        // Replace links
        if (links.length > 0) {
            for (var i = 0; i < links.length; i++) {
                link = links[i].replace(/^((.)(.+))$/, '$1');
                str = str.replace(this.replink, '<a target="_blank" href="' + link + '">' + link + '</a>');
            }
        }
        // Parse spaces
        escs = str.match(/<[^>]+?>/gi);
        str = str.replace(/<[^>]+?>/gi, this.repslsh);
        str = str.replace(/\s{2}/gi, ' &nbsp;');
        for (i in escs) str = str.replace(this.repslsh, escs[i]);
        return str;
    },
    isColor : function(str){
        check = new RegExp("/(^#[0-9A-F]{6})|(^[0-9A-F]{6})|(^#[0-9A-F]{3})|(^[0-9A-F]{3})|(#" + this.coloreg + ")","i");
        return check.test(str);
    },
    parse : function(str) {
        // Add HTML codes
        str = this.convertToHTML(str);
        // Replace links
        str = str.replace(this.linkreg, function(match, p1){if (p1) {return match;} else {return '<a target="_blank" href="' + match + '">' + match + '</a>';}});
        // Filter out embed links (Temporarily Disabled)
        /*
        str = str.replace(/(\\*)\/embed (\S*)/g, function(match, p1, p2){
            var matching = p2.match(this.linkreg);
            if (p1.length == 0 && (matching.length > 1 || matching[0] != "")) {
                    return '<a target=\"_blank\" href=\"'+p2+'\">'+p2+'</a> <a target=\"_blank\" onclick=\"video(\'\', \'embed\', \''+p2+'\')\">[embed]</a>';
            } else {
                return match;
            }
        });*/

        //Word Filters
        str = str.replace(/awakens/gi, 'the shitty chat')
    			 .replace(/vegan/gi, 'terrorist')
    			 .replace(/anon2000/gi, 'gaynon2000');

        // Remove replacement codes
        str = str.replace(RegExp(this.replink, 'g'), '');
        str = str.replace(RegExp(this.repslsh, 'g'), '');
        var escs = str.match(/\\./g);
        str = str.replace(/\\./g, this.repslsh);
        // Add styles
        if (CLIENT.get('styles') == 'on'){
            str = this.multiple(str, /\/\!!([^\|]+)\|?/g, '<div class=neon>$1</div>');
            str = this.multiple(str, /\/\^\^([^\|]+)\|?/g, '<div class=flame>$1</div>');
            str = this.multiple(str, /\/\=([^\|]+)\|?/g, '<div class=no-shadow>$1</div>');
            str = this.multiple(str, /\/\&#35;([^\|]+)\|?/g, '<div class=spoil>$1</div>');
            str = this.multiple(str, /\/\+([^\|]+)\|?/g, '<div class=rotat>$1</div>');
            str = this.multiple(str, /\/\^([^\|]+)\|?/g, '<big>$1</big>');
            str = this.multiple(str, /\/\*([^\|]+)\|?/g, '<strong>$1</strong>');
            str = this.multiple(str, /\/\%([^\|]+)\|?/g, '<i>$1</i>');
            str = this.multiple(str, /\/\_([^\|]+)\|?/g, '<u>$1</u>');
            str = this.multiple(str, /\/\-([^\|]+)\|?/g, '<strike>$1</strike>');
            str = str.replace(/\/\&amp;([^\|]+)\|?/g, '<div class=marquee>$1</div>');
            var ghostly = 'color: transparent;';
            str = this.multiple(str, /\/\@([^\|]+)\|?/g, '<div id=test style="text-shadow: 0 0 2px white;'+ghostly+'">$1</div>')
            str = this.multiple(str, /\/\!([^\|]+)\|?/g, '<div class=flashing>$1</div>');
            str = this.multiple(str, /\/\&#126;([^\|]+)\|?/g, '<small>$1</small>');
            str = this.multiple(str, /\/\`([^\|]+)\|?/g, '<code>$1</code>');
        }
        // Replace >>>/x/<text> with 8ch.net/x/res/<text>
        str = str.replace(/&gt;&gt;&gt;(\/[a-z0-9]+)\/(\d+)?\/?/gi, ' <a target="_blank" href="https://8ch.net$1/$2/">$&</a>');
        str = str.replace(/https:\/\/8chan.co\/([a-z0-9]+)\/res\/"/gi, "https://8ch.net/$1/\"");
        // Add quotes
        var barWidth = 52; //includes quoteDiv border
        function scrollHTML(str1, str2){return '<a onmouseenter = "var quoteDiv = document.createElement(\x27div\x27); quoteDiv.setAttribute(\x27id\x27,\x27quoteDiv\x27); quoteDiv.setAttribute(\x27style\x27,\x27visibility:hidden\x27); setTimeout(function(){$(\x27#quoteDiv\x27).css(\x27visibility\x27,\x27visible\x27);},50); $(\x27#messages\x27).prepend(quoteDiv); $(\x27#quoteDiv\x27).css(\x27position\x27,\x27fixed\x27); $(\x27#quoteDiv\x27).css(\x27z-index\x27,\x275\x27); if (x == undefined){var x = $(document).mousemove(function(e){mouseX = e.pageX; mouseY = e.pageY})} if (quoteDiv != undefined){var msgClone = $(\x27.spooky_msg_'+str2+'\x27).last().parent().clone(); msgClone.children(\x27.message-content\x27).attr(\x27class\x27,\x27message-content msg_quote_'+str2+'\x27); msgClone.find(\x27img\x27).attr(\x27onload\x27,\x27\x27); msgClone.appendTo(\x27#quoteDiv\x27);}if ($(\x27#quoteDiv\x27).height() + mouseY + '+barWidth+' < window.innerHeight){$(\x27#quoteDiv\x27).css({left:mouseX + 30,top:mouseY})}else{$(\x27#quoteDiv\x27).css({left:mouseX + 30,top:window.innerHeight - '+barWidth+' - $(\x27#quoteDiv\x27).height()})}" onmousemove = "if ($(\x27#quoteDiv\x27).height() + mouseY + '+barWidth+' < window.innerHeight){$(\x27#quoteDiv\x27).css({left:mouseX + 30,top:mouseY})}else{$(\x27#quoteDiv\x27).css({left:mouseX + 30,top:window.innerHeight - '+barWidth+' - $(\x27#quoteDiv\x27).height()})}" onmouseout = "$(\x27#quoteDiv\x27).remove();" onclick = "$(\x27#messages\x27).animate({scrollTop: $(\x27.spooky_msg_'+str2+'\x27).last().offset().top - $(\x27#messages\x27).offset().top + $(\x27#messages\x27).scrollTop()},\x27normal\x27,function(){$(\x27.spooky_msg_'+str2+'\x27).last().animate({\x27background-color\x27:\x27rgb(255, 255, 255,0.8)\x27},400,function(){$(\x27.spooky_msg_'+str2+'\x27).last().animate({\x27background-color\x27:\x27transparent\x27},400)});});"><u>'+str1+'</u></a>';}
        function invalidHTML(str){return '<div style = "color: #AD0000">'+str+'</div>';}
        if (/(^|[> ])&gt;&gt;\d+/.test(str)) {
	    str = str.replace(/(&gt;&gt;(\d+))/gi, function(match, p1, p2) {
	        var cut = parseInt(p2);
	        if ($('.spooky_msg_'+cut).length && cut) {
	            return scrollHTML(p1, cut);
	        } else {
	            return invalidHTML(p1)
	        }
	    });
        }
        // Add greentext
        str = str.replace(/^(&gt;.*)$/i, '&#35;789922 $1');
        // Javascript links
        str = str.replace(/(\/\?)([^\|]+)\|([^\|]+)\|?/gi, function(_, __, a, b){
            a = a.replace(/&#35;/gi, '#');
            if(!/[^:]*javascript *:/im.test(a)) {
                a = 'javascript:'+a;
            }
            if (!b.trim()) {
                return '<div><a href="javascript:void(0)" title = "'+a+'" class="jslink" onclick = "'+a+'">' + a + '</a></div>';
            }
            return '<div><a href="javascript:void(0)" title = "'+a+'" class="jslink" onclick = "'+a+'">' + b.trim() + '</a></div>';
        });
        // Replace colors
        str = this.multiple(str, /&#35;&#35;([\da-f]{6}|[\da-f]{3})(.+)$/i, '<span style="background-color: #$1;">$2</span>');
        str = this.multiple(str, /&#35;([\da-f]{6})([^;].*)$/i, '<span style="color: #$1;">$2</span>');
        str = this.multiple(str, /&#35;([\da-f]{3})([^;](?:..[^;].*|.|..|))$/i, '<span style="color: #$1;">$2</span>');
        str = this.multiple(str, RegExp('&#35;&#35;(' + this.coloreg + ')(.+)$', 'i'), '<span style="background-color: $1;">$2</span>');
        str = this.multiple(str, RegExp('&#35;(' + this.coloreg + ')(.+)$', 'i'), '<span style="color: $1;">$2</span>');
        str = this.multiple(str, this.fontRegex, '<span style="font-family:\'$3\'">$4</span>');
        // Replace escapes
        for (i in escs) {
            str = str.replace(this.repslsh, escs[i][1]);
        }
        // Prevent blacklisted images, parse images
        var img = /(<a target="_blank" href="[^"]+?">)([^<]+?\.(?:agif|apng|gif|jpg|jpeg|png|bmp|svg))<\/a>/i.exec(str);
        if (img && CLIENT.get('images') == 'on') {
            // IIFE to test images
            (function(){
                for (var i = 0; i < BLACKLIST.length; i++) {
                    if (img[2].indexOf(BLACKLIST[i]) >= 0) return;
                }
                str = str.replace(img[0], img[1] + '<img src="' + img[2] + '"onload="scrollToBottom()" onerror="imageError(this)" /></a>');
            })();
        }
        // Video embeds
        if (str.search(/(youtu(\.)?be)/gi) != -1)
            str = str.replace(/<a [^>]*href="[^"]*(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?"]*)[^"]*">([^<]*)<\/a>/gi, '<a target="_blank" href="$2">$2</a> <a href="javascript:void(0)" onclick="video(event, \'youtube\', \'$1\')" class="show-video">[video]</a>');
            str = str.replace(/<a [^>]*href="[^"]*vimeo.com\/(\d+)">([^<]*)<\/a>/, '<a target="_blank" href="$2">$2</a> <a href="javascript:void(0)" onclick="video(event, \'vimeo\', \'$1\')" class="show-video">[video]</a>');
            str = str.replace(/<a [^>]*href="[^"]*liveleak.com\/ll_embed\?f=(\w+)">([^<]*)<\/a>/, '<a target="_blank" href="$2">$2</a> <a href="javascript:void(0)" onclick="video(event, \'liveleak\', \'$1\')" class="show-video">[video]</a>');
            str = str.replace(/<a [^>]*href="([^'"]*\.webm)">([^<]*)<\/a>/i, '<a target="_blank" href="$2">$2</a> <a href="javascript:void(0)" onclick="video(event, \'html5\', \'$1\')" class="show-video">[video]</a>');
            str = str.replace(/<a [^>]*href="([^'"]*\.mp4)">([^<]*)<\/a>/i, '<a target="_blank" href="$2">$2</a> <a href="javascript:void(0)" onclick="video(event, \'html5\', \'$1\')" class="show-video">[video]</a>');
            str = str.replace(/<a [^>]*href="[^"]*ustream.tv\/embed\/(\d+)\?v=3&amp;wmode=direct">([^<]*)<\/a>/, '<a target="_blank" href="$2">$2</a> <a href="javascript:void(0)" onclick="video(event, \'ustream\', \'$1\')" class="show-video">[video]</a>');
        //    str = str.replace(/<a [^>]*href="[^"]*[i.]?imgur.com\/([A-Za-z]*\.gifv)[^<]*<\/a>/i, '<iframe allowfullscreen="" frameborder="0" scrolling="no" style="max-width: 200px; max-height: 200px;" src="http://$1#embed"></iframe>');
        // Audio Embeds
            str = str.replace(/<a [^>]*href="([^'"]*\.(mp3|wav|ogg|mid|flac))">([^<]*)<\/a>/i, '<a target="_blank" href="$1">$1</a> <a href="javascript:void(0)" onclick="video(event, \'audio\', \'$1\')" class="show-video">[audio]</a>');
        // Parse spaces
            escs = str.match(/<[^>]+?>/gi);
            str = str.replace(/<[^>]+?>/gi, this.repslsh);
            str = str.replace(/\s{2}/gi, ' &nbsp;');
        for (i in escs)
            str = str.replace(this.repslsh, escs[i]);
        return str;
    }
};

// ------------------------------------------------------------------
// Height Adjustment
// ------------------------------------------------------------------

$(function() {
    // Create and call function to resize chat elements to window
    function resize() {
        var width = $(window).width();
        var height = $(window).height();
        var input = $('#input-bar');
        $('.full-height').each(function() {
            var $this = $(this);
            var padding = $this.outerHeight(true) - $this.height();
            $this.css('height', (height - input.outerHeight(true) - padding) + 'px');
        });
        $('.full-width').each(function() {
            var $this = $(this);
            $this.css('width', $(window).width() + 'px');
        });
	    scrollToBottom();
    }
    resize();
    $(window).resize(resize); // Add event listener to window
});

// ------------------------------------------------------------------
// Autocomplete
// ------------------------------------------------------------------

$(function() {
    var autoCompleteList = false;
    $('<div id="autocomplete"></div>').css('bottom', $('#input-message').outerHeight() + 20 + 'px').appendTo('body');
    $('#input-message').keydown(function(e) {
        var value = $(this).val();
        if (e.keyCode == 9 && value.substr(0,1) == '/' && value.split(' ').length == 1) {
    	    e.preventDefault();
    	    var roles = ['god','super','admin','mod','basic','mute'];
            var ur_role = CLIENT.get('role');
            var possible = _.filter(_.keys(COMMANDS), function(key) {
                var cmd_level = COMMANDS[key].role;
                return key.indexOf(value.substring(1,20)) == 0 &&
(cmd_level == null || roles.indexOf(ur_role) <= roles.indexOf(cmd_level));
            });
            switch (possible.length) {
                case 0:
                    break;
                case 1:
                    $(this).val('/'+possible[0]);
                    break;
                default:
                    CLIENT.show('Possible: '+possible.join(', '));
            }
        } else if (e.keyCode == 9 && !autoCompleteList) {
            // on tab
            e.preventDefault();
            var match = $(this).val().match(/\S+?$/);
            var v = match && match[0].toLowerCase();
            var list = [];
            ONLINE.each(function(user) {
                var user_name = user.get('nick');
                if (!v || user_name.toLowerCase().indexOf(v) == 0) {
                    list.push(user_name);
                }
            });
            $('#autocomplete').show();
            $('#autocomplete').empty();
            $(list).each(function(i) {
                $('#autocomplete').append('<span>' + list[i] + '</span>');
            });
            autoCompleteList = list;
        } else if (e.keyCode == 9 && autoCompleteList) {
            e.preventDefault();
            var list = autoCompleteList;
            if (list.length == 0 || list[0] === undefined) {
                autoCompleteList = false;
                $('#autocomplete').hide();
                this.value += ' ';
            } else if (list.length == 1) {
                autoCompleteList = null;
                $('#autocomplete').hide();
                var x = $(this).val().split(' ');
                x[x.length - 1] = (x[0][0] == "/" ? list[0] : list[0].replace(/([`~^%\-_\\#*]|:\/\/)/g, '\\$1'));
                $(this).val(x.join(' '));
            } else {
                list.push(list.shift());
                $('#autocomplete').html('');
                $(list).each(function(i) {
                    $('#autocomplete').append('<span>' + list[i] + '</span>');
                });
            }
        } else if (e.keyCode == 27 || e.keyCode == 8 && autoCompleteList) {
            e.preventDefault();
            autoCompleteList = false;
            $('#autocomplete').hide();
        } else if (autoCompleteList) {
            e.preventDefault();
            var list = autoCompleteList;
            autoCompleteList = false;
            $('#autocomplete').hide();
            var chr = '';
            if (e.keyCode > 47 && e.keyCode < 58) {
                chr = String.fromCharCode(e.keyCode);
            } else if (e.keyCode > 65 && e.keyCode < 91) {
                chr = String.fromCharCode(e.keyCode + 32);
            } else if (e.keyCode > 95 && e.keyCode < 106) {
                chr = String.fromCharCode(e.keyCode - 48);
            } else if (e.keyCode > 105 && e.keyCode < 112 && e.keyCode != 108) {
                chr = String.fromCharCode(e.keyCode - 64);
            } else if (e.keyCode > 218 && e.keyCode < 222) {
                chr = String.fromCharCode(e.keyCode - 128);
            } else if (e.keyCode > 188 && e.keyCode < 192) {
                chr = String.fromCharCode(e.keyCode - 144);
            } else {
                switch (e.keyCode) {
                case 186:
                    chr = ';';
                    break;
                case 187:
                    chr = '=';
                    break;
                case 188:
                    chr = ',';
                    break;
                case 192:
                    chr = '`';
                    break;
                case 222:
                    chr = '\'';
                    break;
                case 32:
                    chr = ' ';
                    break;
                default:
                    break;
                }
            }
            if (list[0] === undefined) {
                if (chr == '') {
                    chr = ' ';
                }
                this.value += chr;
            } else {
                var x = $(this).val().split(' ');
                x[x.length - 1] = (x[0][0] == "/" ? list[0] : list[0].replace(/([`~^%\-_$|\\#\*]|:\/\/)/g, '\\$1')) + chr;
                $(this).val(x.join(' '));
            }
        }
    });
});

// ------------------------------------------------------------------
// Audio
// ------------------------------------------------------------------

//Set up name-mentioned noise
(function() {
    var sound = ['name', '/audio/Bwoop.wav'];
    var html = [ '<audio id="', sound[0], '_audio"><source src="', sound[1], '"></source><embed width=0 height=0 src="', sound[1], '"></audio>' ].join('');
    $(html).appendTo('body');
    window.playAudio = function(sound) {
        if (CLIENT.get('mute') != 'off') {
            var noise = $('#' + sound + '_audio')[0];
            if (noise) noise.play();
        }
    }
})();

// ------------------------------------------------------------------
// Video
// ------------------------------------------------------------------

function video(event, type, input) {
    var embed;
    function stop(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    function hide() {
        videoOverlay.hide();
        $('.container', videoOverlay).html('');
    }
    event.stopPropagation ? event.stopPropagation() : event.cancelBubble = true
    switch (type) {
        case 'youtube':
            embed = '<iframe width="100%" height="100%" src="//www.youtube.com/embed/' + input + '" frameborder="0" allowfullscreen></iframe>';
            break;
        case 'html5':
            embed = '<video width="100%" height="100%" src="' + input + '" controls loop></video>';
            break;
        case 'liveleak':
            embed = '<iframe width="100%" height="100%" src="http://www.liveleak.com/ll_embed?f=' + input + '" frameborder="0" allowfullscreen></iframe>';
            break;
        case 'vimeo':
            embed = '<iframe src="//player.vimeo.com/video/' + input + '" width="100%" height="100%" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe>';
            break;
        case 'ustream':
            embed = '<iframe src="//www.ustream.tv/embed/' + input + '?v=3&amp;wmode=direct" width="100%" height="100%" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen></iframe>';
            break;
        case 'embed':
            embed = '<iframe width="100%" height="100%" src="' + input + '" frameborder="0" allowfullscreen></iframe>';
            break;
        case 'audio':
			embed = '<audio src="' + input + '" controls loop>' + input + '</audio>'
			break;
    }
    var videoOverlay = $('.video-overlay');
    if (videoOverlay.length === 0) {
        videoOverlay = $('<div class="video-overlay" unselectable="on"></div>').css({
            position : 'absolute',
            top : '50%',
            left : '50%',
            width : '528px',
            height : '322px',
            zIndex : '5'
        }).appendTo('body');
        var header = $('<div class="top"></div>').css({
            cursor : 'move',
            userSelect : 'none',
            backgroundColor : '#444'
        }).appendTo(videoOverlay);
        $('<a href="javascript:void(0)">[close]</a>').click(hide).appendTo(header).mousedown(function(e) {
            e.stopPropagation();
        });
        var dragging = false;
        var shim = null;
        var container = $('<div class="container"></div>').css({
            width : '100%',
            height : 'calc(100% - 34px)',
            backgroundColor : '#111'
        }).appendTo(videoOverlay);
        var bottom = $('<div class="bottom"></div>').css({
            width : '100%',
            height : '15px',
            backgroundColor : '#444'
        }).appendTo(videoOverlay);
        header.mousedown(function(e) {
            dragging = e;
            shim = $('<div></div>').css({
                backgroundColor : 'red',
                position : 'absolute',
                top : 0,
                left : 0,
                zIndex : 1000,
                opacity : 0,
                width : $(window).width() + 'px',
                height : $(window).height() + 'px'
            }).appendTo('body').bind('selectstart', stop);
            $(document).bind('selectstart', stop);
        }).bind('selectstart', stop);
        $(window).mousemove(function(e) {
            if (dragging) {
                var dx = e.pageX - dragging.pageX;
                var dy = e.pageY - dragging.pageY;
                var x = parseInt(videoOverlay.css('marginLeft')) || 0;
                var y = parseInt(videoOverlay.css('marginTop')) || 0;
                videoOverlay.css({
                    marginLeft : (x + dx) + 'px',
                    marginTop : (y + dy) + 'px'
                });
                dragging = e;
            }
        }).mouseup(function(e) {
            dragging = false;
            shim && shim.remove();
            $(document).unbind('selectstart', stop);
        });
        videoOverlay.click(function(e) {
            e.stopPropagation();
        });
    }
    $('.container', videoOverlay).html(embed);
    videoOverlay.css({
        marginTop : (-videoOverlay.height() / 2) + 'px',
        marginLeft : (-videoOverlay.width() / 2) + 'px'
    });
    videoOverlay.show();
    $(".video-overlay").resizable({
        start: function(event, ui) {
        	$(".video-overlay iframe").css("display","none")
        },
        stop: function(event, ui) {
        	$(".video-overlay iframe").css("display","block")
        }
    });
}

// Scroll to bottom on resize
window.addEventListener('resize', function(e){
	scrollToBottom();
});

/////////////////////////////
// Cursors
/////////////////////////////
$(function() {
    var position = null, x, y;
    $(window).mousemove(function(e) {
        x = e.clientX / $(window).width();
        y = e.clientY / $(window).height();
    });

    setInterval(function() {
        if (CLIENT.get('cursors') == 'off' ? 0 : 1 && !position || position.x != x || position.y != y) {
            CLIENT.updateMousePosition(position = {
                x : x,
                y : y
            });
        }
    }, 50);
    CLIENT.on('updateMousePosition', function(msg) {
        var el = $('#cursor-' + msg.id);
        if (el.length == 0) {
            var user = ONLINE.get(msg.id);
            if (user) {
                var nick = $('<span class="nick"></span>').text(user.get('nick'));
                el = $('<div id="cursor-' + msg.id + '" class="mouseCursor"></div>').append(nick).appendTo('body');
                el.css('display', CLIENT.get('cursors') == 'off' ? 'none' : 'block');
                user.on('change:nick', function(m, newNick) {
                    nick.text(newNick);
                });
            }
        }
        el.css({
            left : (msg.position.x * 100) + '%',
            top : (msg.position.y * 100) + '%'
        });
    });
    ONLINE.on('remove', function(user) {
        $('#cursor-' + user.get('id')).remove();
    });
    ONLINE.on('reset', function() {
        $('.mouseCursor').remove();
    });
    CLIENT.on('change:cursors', function(m, cursors) {
        $('.mouseCursor').css({
            display : cursors == 'off' ? 'none' : 'block'
        })
    });
});
