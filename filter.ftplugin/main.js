/* ***************************************** *
 * Filter Plugin for FoldingText 1.3+
 * by Jamie Kowalski, github.com/jamiekowalski/foldingtext-extra
 * ***************************************** */

define(function(require, exports, module) {
  'use strict';
  require('./panel.js');
	
  var Extensions = require('ft/core/extensions'),
      NodePath = require('ft/core/nodepath').NodePath,
      Editor,
      HeadingType,
      debug = false
  
  // TODO check support for quote-wrapped terms
  // TODO automatically enclose terms that don't match \w+ with quotes
  
  function insert_ops( string, custom_default ) {
    string = string.trim()
    if (! string.match(/ /)) return string  // if no spaces, return immediately

    var protector = '=_=',
      ops = [
          'and',
          'or'
      ],
      default_op

    if (string.match('\\b' + ops[0] + '\\b')) {
      default_op = ops[0]
    } else if (string.match('\\b' + ops[1] + '\\b')) {
      default_op = ops[1]
    } else if (custom_default) {
      default_op = custom_default
    } else {
      default_op = ops[1]
    }

    // protect 'not'
    string = string.replace(/\b(not)\b\s*/g, '$1' + protector)
  
    var ops_find = new RegExp('\\s*\\b(' + ops.join('|') + ')\\b\\s*', 'g')
    var ops_replace = ' '
    var space_delim_find = /\s+/g

    // remove existing ops
    string = string.replace(ops_find, ops_replace)
    string = string.trim()

    // insert default
    string = string.replace(space_delim_find, ' ' + default_op + ' ')
  
    // un-protect 'not'
    string = string.replace(new RegExp(protector, 'g'), ' ')

    return string.trim()
  }

    function parse_segment( input, heading_marker ) {
      var s = input.trim(),
          defaultOp = 'and',
          heading_marker_regex = new RegExp( '^' + heading_marker + '\\s*' )
    
      if ( ! s ) {
          return ''
      }
    
      s = s.replace(/#?\b([^\s~<>=]+)\s*([~=]|[<>]=?)\s*/g, '#$1$2')
      // s = s.replace(/\(#[^\s~<>=]+[~<>=]+[^(]+/g, '$&)')
    
      s = insert_ops( s, defaultOp )

      if ( s.match( heading_marker_regex ) ) { // heading
        s = s.replace( heading_marker_regex, '' )
        s = '(' + s + ')'
        s += ' and @type=' + HeadingType
        if (debug) console.log(HeadingType)
      }

      // TODO pull out property queries first

      s = s.replace(/#cm\b/g, '@line:comment')
      s = s.replace(/#hl\b/g, '@line:highlight')
      s = s.replace(/#de?l\b/g, '@line:del')
      s = s.replace(/#ins?\b/g, '@line:ins')
      s = s.replace(/#str?o?n?g?\b/g, '@line:strong')
      s = s.replace(/#em(ph)?\b/g, '@line:em')
      s = s.replace(/#([^\s:]+)\b/g, '@property:$1')
      s = s.replace(/(@property:[^\s:]+)~(\S+)\b/g, '$1 contains $2')
    
      return s
    }

    function parse_path( input ) {
      var input = input.trim(),
          delim = '/',
          heading_marker = ']',
          ancestors_off = '>',
          ancestors,
          descendants
    
      if (! input) {
        return input
      } else if (input.charAt(0) === '/') {
        // assume full XPath; leave it alone
        return input
      }
      
      // set ancestors option
      ancestors = true;
      if (input.charAt(0) === ancestors_off) {
        ancestors = false
        input = input.slice(1)
      }

      // set descendants option
      descendants = false;
      if (input.match(new RegExp('[' + delim + heading_marker + ']\\s*$'))) { // [:\/]\s*$
        descendants = true;
        input = input.slice(0, -1);
      }

      var heading_delim_find = new RegExp('([^' + delim + '\\s])\\s*(' +
          heading_marker + ')', 'g')

      // place delimiter before heading marker if not there
      input = input.replace(heading_delim_find, '$1' + delim + '$2');

      var segments = input.split(new RegExp('\\s*' + delim + '\\s*'))
      var path = ''
 
      segments.forEach(function(segment) {
        path += '//' + parse_segment(segment, heading_marker);
      });
      
    if (path.match(new RegExp(HeadingType + '$'))) { // last segment is a heading // FIXME magic
        descendants = true
      }
    
      if (descendants) {
        path += '///*'
      }
      if (ancestors) {
        path += '/ancestor-or-self::*'
      }
    
      return path
    }
    
    function filter_by_path(path) {
      if (path && ! path.match(/^ +$/)) {
          
        var parse_result = NodePath.parse(path)
        if (parse_result.errorColumn > -1) {
          console.log(path + '\n' + "Path failed at: " +
            parse_result.errorColumn)
        } else {
          if (debug) console.log(path)
          Editor.setNodePath(path);
          Editor.performCommand('scrollToBeginningOfDocument');
        }
      } else {
        Editor.performCommand('focusOut') // TODO should only focus out if not already focused out
      }
    }
    
	Extensions.add('com.foldingtext.editor.commands', {
		name: 'filter',
      performCommand: function (editor) {
        JKPanel.togglePanel()
      }
    });
    
    Extensions.add('com.foldingtext.editor.init', function(editor) {
      Editor = editor;
      if (editor.tree().taxonomy.name === 'markdown') {
        HeadingType = 'heading'
      } else {
        HeadingType = 'project'
      }
      
      JKPanel.addPanel({
        className: 'JKFilterPanel',
        placeholder: 'enter expression...',
        onreturn: function(panelEle, input) {
          filter_by_path(parse_path(input.value))
        },
        onescape: function(panelEle, input) {
          // input.dispatchEvent(new CustomEvent('blur'))
          JKPanel.hidePanel(false)
          // editor.performCommand('focusOut')
        },
        onchange: function(panelEle, input) {
          filter_by_path(parse_path(input.value))
        }
      });
      
      editor.addKeyMap({
        "Shift-Cmd-'" : function (editor) {
          JKPanel.togglePanel();
        }
        
        /* Info about keyboard shortcuts
         * from http://codemirror.net/doc/manual.html#keymaps
         * 
         * Examples of names defined here are Enter, F5, and Q. These can be 
         * prefixed with Shift-, Cmd-, Ctrl-, and Alt- (in that order!) to 
         * specify a modifier. So for example, Shift-Ctrl-Space would be a valid
         * key identifier.
         */

      })
    });
});
