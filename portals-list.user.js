// ==UserScript==
// @author         teo96
// @name           Portals list
// @category       Info
// @version        0.4.3
// @description    Display a sortable list of all visible portals with full details about the team, resonators, links, etc.
// @match          https://intel.ingress.com/*
// @grant          none
// ==/UserScript==

/* global IITC, plugin -- eslint */
/* exported setup, changelog --eslint */

var changelog = [
  {
    version: '0.4.3',
    changes: ['Moved "portalApGainMaths" function from core to portalList plugin', 'IITC.toolbox API is used to create plugin buttons'],
  },
];

// use own namespace for plugin
window.plugin.portalslist = function() {};


function abbreviate(label) {
  return label
    .replaceAll(/[^a-z]/gi, '')
    .substring(0, 3)
    .capitalize();
}

function zeroCounts() {
  return window.plugin.portalslist.FILTERS.reduce((prev, curr) => {
    prev[curr] = 0;
    return prev;
  }, {});
}

/*
 * plugins may add fields by appending their specifiation to the following list. The following members are supported:
 * title: String
 *     Name of the column. Required.
 * value: function(portal)
 *     The raw value of this field. Can by anything. Required, but can be dummy implementation if sortValue and format
 *     are implemented.
 * sortValue: function(value, portal)
 *     The value to sort by. Optional, uses value if omitted. The raw value is passed as first argument.
 * sort: function(valueA, valueB, portalA, portalB)
 *     Custom sorting function. See Array.sort() for details on return value. Both the raw values and the portal objects
 *     are passed as arguments. Optional. Set to null to disable sorting
 * format: function(cell, portal, value)
 *     Used to fill and format the cell, which is given as a DOM node. If omitted, the raw value is put in the cell.
 * defaultOrder: -1|1
 *     Which order should by default be used for this column. -1 means descending. Default: 1
 */

window.plugin.portalslist.fields = [
  {
    title: "Portal Name",
    value: function(portal) { return portal.options.data.title; },
    sortValue: function(value, portal) { return value.toLowerCase(); },
    format: function(cell, portal, value) {
      $(cell)
        .append(plugin.portalslist.getPortalLink(portal))
        .addClass("portalTitle");
    }
  },
  {
    title: "Level",
    value: function(portal) { return portal.options.data.level; },
    format: function(cell, portal, value) {
      $(cell)
        .css('background-color', COLORS_LVL[value])
        .text('L' + value);
    },
    defaultOrder: -1,
  },
  {
    title: "Team",
    value: function(portal) { return portal.options.team; },
    format: function(cell, portal, value) {
      $(cell).text(window.plugin.portalslist.FACTION_ABBREVS[value]);
    }
  },
  {
    title: "Health",
    value: function(portal) { return portal.options.data.health; },
    sortValue: function(value, portal) { return portal.options.team === TEAM_NONE ? -1 : value; },
    format: function(cell, portal, value) {
      $(cell)
        .addClass("alignR")
        .text(portal.options.team === TEAM_NONE ? '-' : value+'%');
    },
    defaultOrder: -1,
  },
  {
    title: "Res",
    value: function(portal) { return portal.options.data.resCount; },
    format: function(cell, portal, value) {
      $(cell)
        .addClass("alignR")
        .text(value);
    },
    defaultOrder: -1,
  },
  {
    title: "Links",
    value: function(portal) { return window.getPortalLinks(portal.options.guid); },
    sortValue: function(value, portal) { return value.in.length + value.out.length; },
    format: function(cell, portal, value) {
      $(cell)
        .addClass("alignR")
        .addClass('help')
        .attr('title', 'In:\t' + value.in.length + '\nOut:\t' + value.out.length)
        .text(value.in.length+value.out.length);
    },
    defaultOrder: -1,
  },
  {
    title: "Fields",
    value: function(portal) { return getPortalFieldsCount(portal.options.guid) },
    format: function(cell, portal, value) {
      $(cell)
        .addClass("alignR")
        .text(value);
    },
    defaultOrder: -1,
  },
  {
    title: "AP",
    value: function(portal) {
      var links = window.getPortalLinks(portal.options.guid);
      var fields = getPortalFieldsCount(portal.options.guid);
      return plugin.portalslist.portalApGainMaths(portal.options.data.resCount, links.in.length + links.out.length, fields);
    },
    sortValue: function(value, portal) { return value.enemyAp; },
    format: function(cell, portal, value) {
      var title = '';
      if (teamStringToId(PLAYER.team) === portal.options.team) {
        title += 'Friendly AP:\t'+value.friendlyAp+'\n'
               + '- deploy '+(8-portal.options.data.resCount)+' resonator(s)\n'
               + '- upgrades/mods unknown\n';
      }
      title += 'Enemy AP:\t'+value.enemyAp+'\n'
             + '- Destroy AP:\t'+value.destroyAp+'\n'
             + '- Capture AP:\t'+value.captureAp;

      $(cell)
        .addClass("alignR")
        .addClass('help')
        .prop('title', title)
        .html(digits(value.enemyAp));
    },
    defaultOrder: -1,
  },
  {
    title: 'V/C',
    value: function(portal) {
      var history = portal.options.data.history;
      if (history) {
        return history.captured ? 2
             : history.visited ? 1
             : 0;
      }
      return -1;
    },
    format: function(cell, portal, value) {
      if (value === -1) { return; }
      $(cell).addClass([
        'history',
        ['unvisited', 'visited', 'captured'][value]
      ]);
      $(cell).append('<div class="icon"></div>');
    }
  },
  {
    title: 'S',
    value: function(portal) {
      var history = portal.options.data.history;
      if (history) {
        return history.scoutControlled ? 1 : 0;
      }
      return -1;
    },
    format: function(cell, portal, value) {
      if (value === -1) { return; }
      $(cell).addClass([
        'history',
        ['unvisited', 'scoutControlled'][value]
      ]);
      $(cell).append('<div class="icon"></div>');
    }
  }
];

//fill the listPortals array with portals avaliable on the map (level filtered portals will not appear in the table)
window.plugin.portalslist.getPortals = function() {
  //filter : 0 = All, 1 = Neutral, 2 = Res, 3 = Enl, -x = all but x
  var retval=false;

  var displayBounds = map.getBounds();

  window.plugin.portalslist.listPortals = [];
  $.each(window.portals, function(i, portal) {
    // eliminate offscreen portals (selected, and in padding)
    if(!displayBounds.contains(portal.getLatLng())) return true;

    if (!('title' in portal.options.data)) {
      return true; // filter out placeholder portals
    }

    retval=true;

    var counts = window.plugin.portalslist.counts;
//    counts[window.plugin.portalslist.FACTION_FILTERS[portal.options.team]]++;

//    if (portal.options.data.history.visited) counts[window.plugin.portalslist.HISTORY_FILTERS[0]]++;
//    if (portal.options.data.history.captured) counts[window.plugin.portalslist.HISTORY_FILTERS[1]]++;
//    if (portal.options.data.history.scoutControlled) counts[window.plugin.portalslist.HISTORY_FILTERS[2]]++;

    // cache values and DOM nodes
    var obj = { portal: portal, values: [], sortValues: [] };

    var row = document.createElement('tr');
    row.className = TEAM_TO_CSS[portal.options.team];
    obj.row = row;

    var cell = row.insertCell(-1);
    cell.className = 'alignR';

    window.plugin.portalslist.fields.forEach(function(field, i) {
      cell = row.insertCell(-1);

      var value = field.value(portal);
      obj.values.push(value);

      obj.sortValues.push(field.sortValue ? field.sortValue(value, portal) : value);

      if(field.format) {
//        field.format(cell, portal, value);
      } else {
        cell.textContent = value;
      }
    });

    window.plugin.portalslist.listPortals.push(obj);
  });

  return retval;
}

window.plugin.portalslist.displayPL = function() {
  var list;
  // plugins (e.g. bookmarks) can insert fields before the standard ones - so we need to search for the 'level' column
  window.plugin.portalslist.sortBy = window.plugin.portalslist.fields.map(function(f){return f.title;}).indexOf('Level');
  window.plugin.portalslist.sortOrder = -1;
//  window.plugin.portalslist.counts = zeroCounts();
  window.plugin.portalslist.filter = 0;

  if (window.plugin.portalslist.getPortals()) {
    list = window.plugin.portalslist.portalTable(window.plugin.portalslist.sortBy, window.plugin.portalslist.sortOrder,window.plugin.portalslist.filter, false);
  } else {
    list = $('<table class="noPortals"><tr><td>Nothing to show!</td></tr></table>');
  };

  if (window.useAppPanes()) {
    $('<div id="portalslist" class="mobile">').append(list).appendTo(document.body);
  } else {
    dialog({
      html: $('<div id="portalslist">').append(list),
      dialogClass: 'ui-dialog-portalslist',
      title: 'Portal list: ' + window.plugin.portalslist.listPortals.length + ' ' + (window.plugin.portalslist.listPortals.length === 1 ? 'portal' : 'portals'),
      id: 'portal-list',
      width: 700
    });
  }
}

window.plugin.portalslist.portalTable = function(sortBy, sortOrder, filter, reversed) {
  // save the sortBy/sortOrder/filter
  window.plugin.portalslist.sortBy = sortBy;
  window.plugin.portalslist.sortOrder = sortOrder;
  window.plugin.portalslist.filter = filter;

  var portals = window.plugin.portalslist.listPortals;
  var sortField = window.plugin.portalslist.fields[sortBy];

  portals.sort(function(a, b) {
    var valueA = a.sortValues[sortBy];
    var valueB = b.sortValues[sortBy];

    if(sortField.sort) {
      return sortOrder * sortField.sort(valueA, valueB, a.portal, b.portal);
    }

//FIXME: sort isn't stable, so re-sorting identical values can change the order of the list.
//fall back to something constant (e.g. portal name?, portal GUID?),
//or switch to a stable sort so order of equal items doesn't change
    return sortOrder *
      (valueA < valueB ? -1 :
      valueA > valueB ?  1 :
      0);
  });

  if(filter !== 0) {
    portals = portals.filter(function(obj) {
      switch (filter) {
        case 1:
        case 2:
        case 3:
        case 4:
          return reversed ^ (1 + obj.portal.options.team === filter);
        case 5:
          return reversed ^ obj.portal.options.data.history.visited;
        case 6:
          return reversed ^ obj.portal.options.data.history.captured;
        case 7:
          return reversed ^ obj.portal.options.data.history.scoutControlled;
      };
    });
  }

  var container = $('<div>');

  filters = document.createElement('div');
  filters.className = 'filters';
  container.append(filters);

  var length = window.plugin.portalslist.listPortals.length;

  window.plugin.portalslist.FILTERS.forEach((label, i) => {
    var cell = filters.appendChild(document.createElement('div'));
    var filterName = 'filter' + abbreviate(label);
    cell.className = 'name ' + filterName;
    cell.textContent = label+':';
    cell.title = 'Show only '+label+' portals';
    $(cell).click(function() {
      if (this.classList.contains('active')) {
        $('#portalslist').empty().append(window.plugin.portalslist.portalTable(sortBy, sortOrder, 0, false));
      } else {
        $('#portalslist').empty().append(window.plugin.portalslist.portalTable(sortBy, sortOrder, i, false));
      }
    });

    if (filter === i && !reversed) {
      cell.classList.add('active');
    }

    cell = filters.appendChild(document.createElement('div'));
    cell.className = 'count ' + filterName;

    if (i == 0) {
      cell.textContent = length;
    } else {
      cell.title = 'Hide '+label+' portals ';
      $(cell).click(function() {
        if (this.classList.contains('active')) {
          $('#portalslist').empty().append(window.plugin.portalslist.portalTable(sortBy, sortOrder, 0, false));
        } else {
          $('#portalslist').empty().append(window.plugin.portalslist.portalTable(sortBy, sortOrder, i, true));
        }
      });

      if (filter === i && reversed) {
        cell.classList.add('active');
      }

      var name = window.plugin.portalslist.FILTERS[i];
//      var count = window.plugin.portalslist.counts[name];
//      cell.textContent = count + ' (' + Math.round(count/length*100) + '%)';
    }
  });

  var tableDiv = document.createElement('div');
  tableDiv.className = 'table-container';
  container.append(tableDiv);

  var table = document.createElement('table');
  table.className = 'portals';
  tableDiv.appendChild(table);

  var thead = table.appendChild(document.createElement('thead'));
  var row = thead.insertRow(-1);

  var cell = row.appendChild(document.createElement('th'));
  cell.textContent = '#';

  window.plugin.portalslist.fields.forEach(function(field, i) {
    cell = row.appendChild(document.createElement('th'));
    cell.textContent = field.title;
    if(field.sort !== null) {
      cell.classList.add("sortable");
      if(i === window.plugin.portalslist.sortBy) {
        cell.classList.add("sorted");
      }

      $(cell).click(function() {
        var order;
        if(i === sortBy) {
          order = -sortOrder;
        } else {
          order = field.defaultOrder < 0 ? -1 : 1;
        }

        $('#portalslist').empty().append(window.plugin.portalslist.portalTable(i, order, filter, reversed));
      });
    }
  });

  portals.forEach(function(obj, i) {
    var row = obj.row
    if(row.parentNode) row.parentNode.removeChild(row);

    row.cells[0].textContent = i+1;

    table.appendChild(row);
  });

  container.append(`<div class="disclaimer">Click on portals table headers to sort by that column.
Click on <b>${window.plugin.portalslist.ALL_FACTION_FILTERS.join(', ')}</b> to only show portals owned by that faction
 or on the number behind the factions to show all but those portals.
Click on <b>${window.plugin.portalslist.HISTORY_FILTERS.join(', ')}</b> to only show portals the user has a history for or on the number to hide those.
</div>`);

    console.log (container);
  return container;
}

// portal link - single click: select portal
//               double click: zoom to and select portal
// code from getPortalLink function by xelio from iitc: AP List - https://raw.github.com/breunigs/ingress-intel-total-conversion/gh-pages/plugins/ap-list.user.js
window.plugin.portalslist.getPortalLink = function(portal) {
  var coord = portal.getLatLng();
  var perma = window.makePermalink(coord);

  // jQuery's event handlers seem to be removed when the nodes are remove from the DOM
  var link = document.createElement("a");
  link.textContent = portal.options.data.title;
  link.href = perma;
  link.addEventListener("click", function(ev) {
    renderPortalDetails(portal.options.guid);
    ev.preventDefault();
    return false;
  }, false);
  link.addEventListener("dblclick", function(ev) {
    zoomToAndShowPortal(portal.options.guid, [coord.lat, coord.lng]);
    ev.preventDefault();
    return false;
  });
  return link;
}

window.plugin.portalslist.onPaneChanged = function(pane) {
  if(pane === "plugin-portalslist")
    window.plugin.portalslist.displayPL();
  else
    $("#portalslist").remove()
};

var setup =  function() {
  window.plugin.portalslist.FACTION_FILTERS = window.TEAM_NAMES;
//  window.plugin.portalslist.FACTION_ABBREVS = window.plugin.portalslist.FACTION_FILTERS.map(abbreviate);
  window.plugin.portalslist.ALL_FACTION_FILTERS = ['All', ...window.plugin.portalslist.FACTION_FILTERS];
  window.plugin.portalslist.HISTORY_FILTERS = ['Visited', 'Captured', 'Scout Controlled'];
  window.plugin.portalslist.FILTERS = [...window.plugin.portalslist.ALL_FACTION_FILTERS, ...window.plugin.portalslist.HISTORY_FILTERS];

  window.plugin.portalslist.listPortals = [];
  window.plugin.portalslist.sortBy = 1; // second column: level
  window.plugin.portalslist.sortOrder = -1;
//  window.plugin.portalslist.counts = zeroCounts();
  window.plugin.portalslist.filter = 0;

  if (window.useAppPanes()) {
    app.addPane("plugin-portalslist", "Portals list", "ic_action_paste");
    addHook("paneChanged", window.plugin.portalslist.onPaneChanged);
  } else {
    IITC.toolbox.addButton({
      label: 'Portals list',
      title: 'Display a list of portals in the current view [t]',
      action: window.plugin.portalslist.displayPL,
      accesskey: 't',
    });
  }

    console.log ("setup called#1");
  $("<style>")
    .prop("type", "text/css")
    .html('@include_string:portals-list.css@')
    .appendTo("head");
    console.log ("setup called#2");
};

// given counts of resonators, links and fields, calculate the available AP
// doesn't take account AP for resonator upgrades or AP for adding mods
window.plugin.portalslist.portalApGainMaths = function (resCount, linkCount, fieldCount) {
  var deployAp = (8 - resCount) * window.DEPLOY_RESONATOR;
  if (resCount === 0) deployAp += window.CAPTURE_PORTAL;
  if (resCount !== 8) deployAp += window.COMPLETION_BONUS;
  // there could also be AP for upgrading existing resonators, and for deploying mods - but we don't have data for that
  var friendlyAp = deployAp;

  var destroyResoAp = resCount * window.DESTROY_RESONATOR;
  var destroyLinkAp = linkCount * window.DESTROY_LINK;
  var destroyFieldAp = fieldCount * window.DESTROY_FIELD;
  var captureAp = window.CAPTURE_PORTAL + 8 * window.DEPLOY_RESONATOR + window.COMPLETION_BONUS;
  var destroyAp = destroyResoAp + destroyLinkAp + destroyFieldAp;
  var enemyAp = destroyAp + captureAp;

  return {
    friendlyAp: friendlyAp,
    enemyAp: enemyAp,
    destroyAp: destroyAp,
    destroyResoAp: destroyResoAp,
    captureAp: captureAp,
  };
};

// ============================================================

function wrapper(plugin_info) {
  // Make sure that window.plugin exists. IITC defines it as a no-op function,
  // and other plugins assume the same.
  if(typeof window.plugin !== 'function') window.plugin = function() {};

  // Name of the IITC build for first-party plugins
  plugin_info.buildName = 'hello';

  // Datetime-derived version of the plugin
  plugin_info.dateTimeVersion = '20150829103500';

  // ID/name of the plugin
  plugin_info.pluginId = 'hello';

  // The entry point for this plugin.
  function setup() {
    alert('Hello, IITC!');
  window.plugin.portalslist.FACTION_FILTERS = window.TEAM_NAMES;
//  window.plugin.portalslist.FACTION_ABBREVS = window.plugin.portalslist.FACTION_FILTERS.map(abbreviate);
  window.plugin.portalslist.ALL_FACTION_FILTERS = ['All', ...window.plugin.portalslist.FACTION_FILTERS];
  window.plugin.portalslist.HISTORY_FILTERS = ['Visited', 'Captured', 'Scout Controlled'];
  window.plugin.portalslist.FILTERS = [...window.plugin.portalslist.ALL_FACTION_FILTERS, ...window.plugin.portalslist.HISTORY_FILTERS];

  window.plugin.portalslist.listPortals = [];
  window.plugin.portalslist.sortBy = 1; // second column: level
  window.plugin.portalslist.sortOrder = -1;
//  window.plugin.portalslist.counts = zeroCounts();
  window.plugin.portalslist.filter = 0;

  if (window.useAppPanes()) {
    app.addPane("plugin-portalslist", "Portals list", "ic_action_paste");
    addHook("paneChanged", window.plugin.portalslist.onPaneChanged);
  } else {
    IITC.toolbox.addButton({
      label: 'Portals list',
      title: 'Display a list of portals in the current view [t]',
      action: window.plugin.portalslist.displayPL,
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
