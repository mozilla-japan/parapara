/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

define([ 'jquery', 'walls/wall' ],
function ($, Wall) {
  return function (wallName, sessionId)
  {
    var runner = this;

    runner.initialize = function() {
      // Check for support
      if (!window.SVGAnimateElement) {
        showError("This browser does not support SVG animation.");
        return;
      }
      if (!window.EventSource) {
        showError("This browser does not support event streaming.");
        return;
      }

      // Look up wall
      if (!wallName) {
        showError("No wall specified");
        return;
      }
      var url = '/api/walls/byname/' + wallName;
      var wall, design;
      var deferred = $.get(url)
        .then(function(data) {
          if (data.error_key || !data.designId) {
            showError("Couldn't load wall");
            console.log("Wall not found");
            console.log(data);
            return deferred.fail();
          }
          wall = data;

          // Fetch designs
          return $.get('/api/designs');
        })
        .then(function(designs) {
          if (designs.error_key) {
            showError("Couldn't load wall");
            console.log("Error in designs");
            console.log(designs);
            return deferred.fail();
          }
          // Find the design for this wall
          var result =
            $.grep(designs, function(d) { return d.designId == wall.designId;});
          if (result.length !== 1) {
            showError("Couldn't load wall");
            console.log("Couldn't find matching design");
            console.log(designs);
            return deferred.fail();
          }
          design = result[0];
          if (!design.wall) {
            showError("Couldn't load wall");
            console.log("Couldn't find wall source for design");
            console.log(design);
            return deferred.fail();
          }

          // Update window title
          document.title = wall.name;

          // Work out iframe src
          // - If we have a query string on the parent, set the same
          //   query string on the child.
          var iframeSrc = design.wall + document.location.search;

          // Start loading wall design
          var iframe = $("iframe.wall");
          iframe.attr('src', iframeSrc);
          iframe[0].addEventListener("load", function() {
            runner.initWall(wall, design, iframe[0]);
          });
        })
        .fail(function() {
          showError("Couldn't load wall");
          console.log("Couldn't load designs");
        });
    }

    // XXX i10n
    function showError(msg) {
      $("div.error").text(msg).show();
      $("body").addClass("error");
    }

    runner.initWall = function(wallData, designData, iframe) {
      // We have a default implementation of a Wall controller but specific
      // walls can override this by defining an initialize method on the
      // document to which we pass the default implementation so that they can
      // selectively override the methods they care about
      wallProto = Wall;
      if (iframe.contentDocument.initialize) {
        wallProto =
          iframe.contentDocument.initialize(Wall, wallData, designData, $) ||
          Wall;
      }
      var wall = new wallProto(iframe.contentDocument, wallData);

      // Set up data
      if (!sessionId) {
        runner.initLiveStream(wall);
      } else {
        runner.initSessionDisplay(wall, sessionId);
      }
    };

    runner.initLiveStream = function(wall) {
      // Close old stream
      if (runner.wallStream) {
        runner.wallStream.close();
        runner.wallStream = null;
      }
      var wallStream = runner.wallStream =
        new EventSource('/api/walls/byname/' + wallName + '/live');
      wallStream.onerror = function(e) {
        console.log("Dropped connection?");
      };

      // Map to wall callbacks
      wallStream.addEventListener("sync-progress", function(e) {
        wall.syncProgress(parseFloat(e.data));
      });
      wallStream.addEventListener("start-session",
        wall.startSession.bind(wall));
      wallStream.addEventListener("add-character", function(e) {
        wall.addCharacter(JSON.parse(e.data));
      });
      wallStream.addEventListener("remove-character", function(e) {
        wall.removeCharacter(parseInt(e.data));
      });
      wallStream.addEventListener("change-duration", function(e) {
        wall.changeDuration(parseFloat(e.data));
      });
      wallStream.addEventListener("change-design", function(e) {
        window.location.reload(true);
      });
      wallStream.addEventListener("remove-wall", function(e) {
        showError("Wall removed");
        wallStream.close();
      });
    };

    runner.initSessionDisplay = function(wall, sessionId) {
      var url =
        '/api/walls/byname/' + wallName +
        '/sessions/' + sessionId + '/characters';
      var deferred = $.get(url)
        .then(function(characters) {
          if (characters.error_key) {
            showError("Couldn't load wall");
            console.log("Error in characters");
            console.log(characters);
            return deferred.fail();
          }
          characters.forEach(function(character) {
            wall.addCharacter(character);
          });
        })
        .fail(function() {
          showError("Couldn't load wall");
          console.log("Couldn't find session");
        });
    };
  };
});
