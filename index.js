'use strict';

var promise = require("bluebird");
var twemoji = require('twemoji');
var cheerio = require('cheerio');
var puppeteer = require('puppeteer');
var Duplex = require('stream').Duplex;

module.exports = {
  initialize : function (dataSource, callback) {
    var settings = dataSource.settings || {};

    function createRenderings(renderings) {
      var jobs = renderings.map(function (rendering) {
        return createRendering(
          rendering.id, rendering.html, rendering.extension, rendering.folder, rendering.pages)
      })
      return promise.all(jobs);
    }

    async function createRendering(id, html, extension, folder, pages) {
      var Container = dataSource.models.Container;
      var app = Container.app;
      var storage = app.datasources.storage;

      folder = folder || '';

      html = twemoji.parse(html, {
          folder: 'svg',
          ext: '.svg'
      });
      var parsedHtml = cheerio.load(html);
      parsedHtml
      ('head')
      .append('<style>img.emoji {height: 1em;width: 1.3em;margin: .1em;vertical-align: text-bottom;}</style>')
      .append('<style>body{margin: 0;padding: 0;}}</style>')
      html = parsedHtml.html();

      const args = settings.puppeteer;
      const browser = await puppeteer.launch();
      const page = await browser.newPage();
      await page.goto(`data:text/html,${html}`, { timeout: 'networkidle0' });

      var buffer;
      if(extension === 'pdf'){
        buffer = await page.pdf(args);
      }else{
        var mmToPx = 3.779220779220779;
        var width = parseInt(args.width.replace('mm', '') * mmToPx);
        var height = parseInt(args.height.replace('mm', '') * mmToPx);
        buffer = await page.screenshot({
          clip: {
            x:0,
            y:0,
            width: width,
            height: height
          }
        })
      }

      await browser.close();

      let stream = new Duplex();
      stream.push(buffer);
      stream.push(null);

      return Container.uploadFromStream(stream,
          storage.settings.container,
          folder + id + '.' + extension);
    }

    function getRendering(id, req, res, cb, extension, folder) {
      var Container = dataSource.models.Container;
      var app = Container.app;

      folder = folder || '';

      return Container.download(app.datasources.storage.settings.container,
        folder + id + '.' + extension, req, res, cb);
    }

    var connector = {
      createRendering: createRendering,
      getRendering : getRendering,
      createRenderings: createRenderings
    };

    dataSource.connector = connector;
    dataSource.connector.dataSource = dataSource;

    callback();
  }
}
