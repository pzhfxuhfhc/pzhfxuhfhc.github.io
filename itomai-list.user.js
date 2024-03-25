// ==UserScript==
// @author         gyontarl
// @name           Itomai list
// @category       Info
// @version        0.0.1
// @description    Display itomai portals
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

// Disclaimer
// メニューの「Itomai list」を押すと，P8 Ito- ポータルの一覧が出ます．
// 存在しない時は空リストが表示されます（「見つかりませんでした」とかは出ません）
// async/awaitでクエリを逐次処理してるので，サーバ負荷は低いはず．
// その代わり，ENL P8のポータル数が多いとクエリ処理に時間がかかります
// (数十秒〜数分）
// サーバが502 Bad Gatewayを返した時のエラー処理はサボってます
// (リトライとかはしてません)

window.plugin.itomailist = function() {};

window.plugin.itomailist.showPL = function (portal_list) {
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
	$('<div id="itomailist">').append(list).appendTo(document.body);
	$("#itomailist").css ({
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
	    html: $('<div id="itomailist">').append(list),
	    dialogClass: 'ui-dialog-itomailist',
	    title: 'Itomai list:',
	    id: 'portal-list',
	    width: 700
	});
    }
};

window.plugin.itomailist.collectPL = async function() {
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
	// if (portal.options.team != 2) continue;
	if (portal.options.data.level != 8) continue;
	
	count++;
	await portalDetail.request(portal.options.guid).then (details => {
	    var target_mod = "Ito En Transmuter (-)";
	    // var target_mod = "Portal Shield";

	    for (var i = 0; i < 4; i++) {
		if (details.mods [i] && details.mods [i].name == target_mod) {
		    console.log ("pushed!! " + details.mods [i].name);
		    portal_list.push (portal);
		    break;
		}
	    }
	});
    }

    console.log ("portal_list: " + portal_list);
    console.log ("count: " + count);
    window.plugin.itomailist.showPL (portal_list);
};

window.plugin.itomailist.onPaneChanged = function(pane) {
  if(pane === "plugin-itomailist")
    window.plugin.itomailist.collectPL();
  else
    $("#itomailist").remove()
};

// ============================================================

function wrapper(plugin_info) {
  // Make sure that window.plugin exists. IITC defines it as a no-op function,
  // and other plugins assume the same.
  if(typeof window.plugin !== 'function') window.plugin = function() {};

  // Name of the IITC build for first-party plugins
  plugin_info.buildName = 'Itomai list';

  // Datetime-derived version of the plugin
  plugin_info.dateTimeVersion = '20240315144500';

  // ID/name of the plugin
  plugin_info.pluginId = 'Itomai list';

  // The entry point for this plugin.
  function setup() {
  window.plugin.itomailist.FACTION_FILTERS = window.TEAM_NAMES;
//  window.plugin.itomailist.FACTION_ABBREVS = window.plugin.itomailist.FACTION_FILTERS.map(abbreviate);
  window.plugin.itomailist.ALL_FACTION_FILTERS = ['All', ...window.plugin.itomailist.FACTION_FILTERS];
  window.plugin.itomailist.HISTORY_FILTERS = ['Visited', 'Captured', 'Scout Controlled'];
  window.plugin.itomailist.FILTERS = [...window.plugin.itomailist.ALL_FACTION_FILTERS, ...window.plugin.itomailist.HISTORY_FILTERS];

  window.plugin.itomailist.listPortals = [];
  window.plugin.itomailist.sortBy = 1; // second column: level
  window.plugin.itomailist.sortOrder = -1;
//  window.plugin.itomailist.counts = zeroCounts();
  window.plugin.itomailist.filter = 0;

  if (window.useAppPanes()) {
    app.addPane("plugin-itomailist", "Itomai list", "ic_action_paste");
    addHook("paneChanged", window.plugin.itomailist.onPaneChanged);
  } else {
    IITC.toolbox.addButton({
      label: 'Itomai list',
      title: 'Display a list of portals in the current view [t]',
      action: window.plugin.itomailist.collectPL,
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
