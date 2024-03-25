// ==UserScript==
// @author         gyontarl
// @name           Modaki list
// @category       Info
// @version        0.0.1
// @description    Display modaki portals
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

// Disclaimer
// メニューの「Itomai list」を押すと，ENL P8 Mod空きポータルの一覧が出ます．
// 存在しない時は空リストが表示されます（「見つかりませんでした」とかは出ません）
// async/awaitでクエリを逐次処理してるので，サーバ負荷は低いはず．
// その代わり，ENL P8のポータル数が多いとクエリ処理に時間がかかります
// (数十秒〜数分）
// また，それなりに垢バンリスクがあるので乱用は避けましょう．
// サーバが502 Bad Gatewayを返した時のエラー処理はサボってます
// (リトライとかはしてません)

window.plugin.modakilist = function() {};

window.plugin.modoakilist.showPL = function (portal_list) {
    var list = $('<div>');

    $.each(portal_list, function(i, portal) {
	var coord = portal.getLatLng();
	var perma = window.makePermalink(coord);
	var link = document.createElement("a");
	link.textContent = portal.options.data.title;
	link.href = perma;
	link.addEventListener("click", function(ev) {
	    renderPortalDetails(portal.options.guid);
	    ev.preventDefault();
	    return false;
	}, false);
	list.append (link).append ($('<br>'));
    });

    if (window.useAppPanes()) {
	$('<div id="modoakilist">').append(list).appendTo(document.body);
	$("#modoakilist").css ({
	    "background": "transparent",
	    //	  "background": "green",
	    "border": "0 none",
	    "width": "100%",
	    "height": "100%",
	    "left": "0",
	    "top": "0",
	    "position": "absolute",
	    "overflow": "auto",
	});
    } else {
	dialog({
	    html: $('<div id="modoakilist">').append(list),
	    dialogClass: 'ui-dialog-modoakilist',
	    title: 'Modaki list:',
	    id: 'portal-list',
	    width: 700
	});
    }
};

window.plugin.modoakilist.collectPL = async function() {
    var list = $('<div>');
    var portal_list = [];

    var count = 0;
    for (var guid in window.portals) {
	var portal = window.portals [guid];
	var displayBounds = map.getBounds();
	if(!displayBounds.contains(portal.getLatLng())) continue;
	if (!('title' in portal.options.data)) {
	    continue; // filter out placeholder portals
	}
	
	console.log ("------");
	console.log ("team: " + portal.options.team);
	console.log ("level: " + portal.options.data.level);
	console.log ("guid: " + portal.options.guid);
	if (portal.options.team != 2) continue;
	if (portal.options.data.level != 8) continue;
	
	count++;
	await portalDetail.request(portal.options.guid).then (details => {
	    for (var i = 0; i < 4; i++) {
		console.log ("details.mods [i]: " + details.mods [i]);
		if (!details.mods [i]) {
		    console.log ("pushed!! " + details.mods [i]);
		    portal_list.push (portal);
		    break;
		}
	    }
	});
    }

    console.log ("portal_list: " + portal_list);
    console.log ("count: " + count);
    window.plugin.modoakilist.showPL (portal_list);
};

window.plugin.modoakilist.onPaneChanged = function(pane) {
  if(pane === "plugin-modoakilist")
    window.plugin.modoakilist.collectPL();
  else
    $("#modoakilist").remove()
};

// ============================================================

function wrapper(plugin_info) {
  // Make sure that window.plugin exists. IITC defines it as a no-op function,
  // and other plugins assume the same.
  if(typeof window.plugin !== 'function') window.plugin = function() {};

  // Name of the IITC build for first-party plugins
  plugin_info.buildName = 'Modaki list';

  // Datetime-derived version of the plugin
  plugin_info.dateTimeVersion = '20240315144500';

  // ID/name of the plugin
  plugin_info.pluginId = 'Modaki list';

  // The entry point for this plugin.
  function setup() {
      if (window.useAppPanes()) {
	  app.addPane("plugin-modoakilist", "Modaki list", "ic_action_paste");
	  addHook("paneChanged", window.plugin.modoakilist.onPaneChanged);
      } else {
	  IITC.toolbox.addButton({
	      label: 'Modaki list',
	      title: 'Display a list of modaki portals in the current view [t]',
	      action: window.plugin.modoakilist.collectPL,
	      accesskey: 't',
	  });
      }
      
      console.log ("setup called#1");
      $("<style>")
	  .prop("type", "text/css")
	  .html('@include_string:portals-list.css@')
	  .appendTo("head");
      console.log ("setup called#2");
  }
    
  // Add an info property for IITC's plugin system
  setup.info = plugin_info;

  // Make sure window.bootPlugins exists and is an array
  if (!window.bootPlugins) window.bootPlugins = [];
  // Add our startup hook
  window.bootPlugins.push(setup);
  // If IITC has already booted, immediately run the 'setup' function
  if (window.iitcLoaded && typeof setup === 'function') setup();
}

// Create a script element to hold our content script
var script = document.createElement('script');
var info = {};

// GM_info is defined by the assorted monkey-themed browser extensions
// and holds information parsed from the script header.
if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
  info.script = {
    version: GM_info.script.version,
    name: GM_info.script.name,
    description: GM_info.script.description
  };
}

// Create a text node and our IIFE inside of it
var textContent = document.createTextNode('('+ wrapper +')('+ JSON.stringify(info) +')');
// Add some content to the script element
script.appendChild(textContent);
// Finally, inject it... wherever.
(document.body || document.head || document.documentElement).appendChild(script);
