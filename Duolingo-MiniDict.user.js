// ==UserScript==
// @name       Duolingo-MiniDict
// @namespace  http://github.com/killkeeper/duolingo-minidict
// @version    0.1
// @description  A built-in dictionary for Duolingo
// @resource css https://brianreavis.github.io/selectize.js/css/selectize.default.css
// @match      https://www.duolingo.com/*
// @grant      none
// ==/UserScript==

(function($) {
    function DMDict(settings) {
        this.vocab_list = {};
        
        this.opts = $.extend({
            update_freq: 3600 * 3, // 3 hours
            force_update: false,
            datatableify: false,
        }, settings);
        
        this.local_storage = (typeof Storage == 'function');
        console.log(this.local_storage);
        this.data_pending = false;
        this.last_updated = {};
        
        this.lev_distance = function(s, t) {
            // http://stackoverflow.com/questions/11919065/sort-an-array-by-the-levenshtein-distance-with-best-performance-in-javascript
            
            var d = []; //2d matrix
            
            // Step 1
            var n = s.length;
            var m = t.length;
            
            if (n == 0) return m;
            if (m == 0) return n;
            
            //Create an array of arrays in javascript (a descending loop is quicker)
            for (var i = n; i >= 0; i--) d[i] = [];
            
            // Step 2
            for (var i = n; i >= 0; i--) d[i][0] = i;
            for (var j = m; j >= 0; j--) d[0][j] = j;
            
            // Step 3
            for (var i = 1; i <= n; i++) {
                var s_i = s.charAt(i - 1);
                
                // Step 4
                for (var j = 1; j <= m; j++) {
                    
                    //Check the jagged ld total so far
                    if (i == j && d[i][j] > 4) return n;
                    
                    var t_j = t.charAt(j - 1);
                    var cost = (s_i == t_j) ? 0 : 1; // Step 5
                    
                    //Calculate the minimum
                    var mi = d[i - 1][j] + 1;
                    var b = d[i][j - 1] + 1;
                    var c = d[i - 1][j - 1] + cost;
                    
                    if (b < mi) mi = b;
                    if (c < mi) mi = c;
                    
                    d[i][j] = mi; // Step 6
                    
                    //Damerau transposition
                    if (i > 1 && j > 1 && s_i == t.charAt(j - 2) && s.charAt(i - 2) == t_j) {
                        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost);
                    }
                }
            }
            
            // Step 7
            return d[n][m];
        }
        
        this.initialize = function() {
            /* check languages */
            this.learning_language = duo.user.get('learning_language');
            this.from_language = duo.user.get('ui_language');
            this.dict_lang = this.learning_language + "/" + this.from_language;
            
            this.check_vocab_list_updates();
        }
        
        this.check_vocab_list_updates = function() {
            console.log("local_storage:", this.local_storage);
            if (this.local_storage) {
                $.extend(this.last_updated,
                         JSON.parse(localStorage.getItem('dmdict-last-updated')) || {});
                var dict_last_updated = this.last_updated[this.dict_lang] || 0;
                
                console.log(this.last_updated);
                
                var secs_elapsed = (new Date() - new Date(dict_last_updated)) / 1000;
                console.log('Dictionary ' + this.dict_lang + ' updated ' + 
                            secs_elapsed + ' ago.');
                
                if (secs_elapsed > this.opts.update_freq || secs_elapsed < 0 || 
                    this.opts.force_update) {
                    return this.fetch_vocab_list();
                }
                else {
                    var _cached = localStorage.getItem(
                        'dmdict-cache-' + this.dict_lang);
                    if (!_cached) return this.fetch_vocab_list();
                    
                    this.vocab_list[this.dict_lang] = JSON.parse(_cached);
                    console.log(this.vocab_list[this.dict_lang]);
                }
            }
            else {
                this.fetch_vocab_list();
            }
        }
        
        this.fetch_vocab_list = function() {
            this.data_pending = true;
            
            var vlist = new duo.VocabList;
            var callback = (function(self) {
                return function() {
                    self.parse_vocab_list.call(self, vlist);
                };
            })(this);
            
            vlist.fetch({
                data: {},
                success: callback
            });
        }
        
        this.query = function(lang, query) {
        	if (this.vocab_list[lang] == undefined) return [];
            var regex = new RegExp(query);
            
            var wl = $.grep(this.vocab_list[lang].words, function(w, i) {
            	return regex.test(w.word_string);
            });
            
            return wl;
            //return {'wordlist': wl};    
        }
        
        this.parse_vocab_list = function(vlist) {
            console.log(vlist.toJSON());
            var flang = vlist.from_language,
                llang = vlist.learning_language,
                dlang = llang + '/' + flang,
                len = vlist.length,
                words = vlist.toJSON();
            
            var dict = {
                from_lang: flang,
                learn_lang: llang,
                num_words: len,
                words: words
            };
            
            this.learning_language = llang;
            this.from_language = flang;
            this.dict_lang = dlang;
            
            this.vocab_list[dlang] = dict;
            if (this.local_storage) {
                localStorage.setItem('dmdict-cache-' + dlang, JSON.stringify(dict));
                var _l = {};
                _l[dlang] = new Date();
                $.extend(this.last_updated, _l);
                localStorage.setItem('dmdict-last-updated', JSON.stringify(this.last_updated));
            }
            
            console.log("Dictionary cached for language: " + dlang + "; " +
                        len + "words in dictionary.");
            
            //console.log(localStorage.getItem('dmdict-cache-' + dlang));
            this.data_pending = false;
        }
    };
    
    $(document).ready(function() {
        console.log("duo minidictloaded");
        $("ul.topbar-nav-main").append('<li><a id="duo-minidict" href="#"><small>MDict</small></a></li>');
        $("ul.topbar-nav-main").append('<div class="popover" role="tooltip" style="display: none; overflow-y: visible; width: 256px;" id="duo-selectize-container">' + 
                                       '<h6 class="popover-title">MiniDict - Type to search:</h6>' +
                                       '<div class="popover-content" id="md-selectize">' +
                                       '<select id="select-word" placeholder="Search for a word..."></select>' +
                                       '</div></div>');
        
        $('#duo-minidict').on("click", function() {
            var p = $(this).position();
            console.log(p);
            var h = $(this).height();
            $("#duo-selectize-container").toggle()
            .css({'overflow': 'visible', 
                  'top': p.top + h + 24,
                  'left': p.left - 96,
                  'position': 'absolute'});
            
        });
        
        $('<link rel="stylesheet" href="https://brianreavis.github.io/selectize.js/css/selectize.default.css" />').appendTo('head');
        $('<style type="text/css">' +
          '.popover { overflow: visible !important; width: 256px; position: absolute; }' +
          '.popover-title { margin-left: 5px; }</style>').appendTo('head');
        
        $.getScript("https://brianreavis.github.io/selectize.js/js/selectize.js",
                    function() {
                        console.log("Loaded!");
                        var dmDict = new DMDict();
                        dmDict.initialize();
                        
                        $('#select-word').selectize({
                            theme: 'wordlist',
                            valueField: 'word_string',
                            labelField: 'word_string',
                            searchField: 'word_string',
                            loadThrottle: 500,
                            maxOptions: 10,
                            options: [],
                            create: false,
                            render: {
                                option: function(item, escape) {
                                    console.log(item);
                                    return '<div><strong>' + escape(item.word_string) + '</strong><br /><em>' + item.pos + '</em></div>';
                                }
                            },
                            load: function(query, callback) {
                                if (!query.length) return callback();
                                
                                var dict_lang = duo.user.get('learning_language') + '/' +
                                    duo.user.get('ui_language');
                                
                                /* in target language */
                                var foreign_words = dmDict.query(dict_lang, query);
                                console.log(foreign_words);
                                if (foreign_words.length > 0) {
                                	callback(foreign_words.slice(0, 25));
                                }
                                else {
                                	callback();
                                }
                                
                            }
                        });
                        
                    });
    });
})(jQuery);