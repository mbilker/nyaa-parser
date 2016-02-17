"use strict";

const fs = require('fs');
const path = require('path');
const async = require('async');
const request = require('request');
const FeedParser = require('feedparser');
const Iconv = require('iconv').Iconv;
const clc = require('cli-color');

const _ = require('lodash');
const Rtorrent = require('node-rtorrent');

const r = /\[(.+?)] ([^[]+) - ([0-9a-zA-Z\.]+)/;

function checkPost(post) {
  const shows = [
    /Hiryuu.*Hai to Gensou no Grimgar/i,
    /DameDesuYo.*Dimension W/i,
    /GJM.*Boku dake ga Inai Machi/i,
    /Mori.*Dagashi Kashi/i,
    /Commie.*Schwarzesmarken - (?:0[4-9]|[1-2][0-9])/i
  ];
  const testResult = shows.some(regex => regex.test(post.title));
  const color = testResult ? clc.green('true') : clc.red('false');

  //console.log(`${color} ${post.title} - ${post.guid}`);

  return testResult;
}

function fetch(feed, cb) {
  // Define our streams
  const req = request(feed, {timeout: 10000, pool: false});
  req.setMaxListeners(50);
  // Some feeds do not respond without user-agent and accept headers.
  req.setHeader('user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36');
  req.setHeader('accept', 'text/html,application/xhtml+xml');

  const feedparser = new FeedParser();

  // Define our handlers
  req.on('error', err => {
    console.error(`${feed} req error: ${err.stack}`);
    cb(null, []);
  });
  req.on('response', res => {
    if (res.statusCode != 200) {
      return req.emit('error', new Error('Bad status code'));
    }

    const charset = getParams(res.headers['content-type'] || '').charset;
    res = maybeTranslate(res, charset);
    // And boom goes the dynamite
    res.pipe(feedparser);
  });

  let posts = [];
  feedparser.on('error', err => {
    console.error(`${feed} parse error: ${err.stack}`);
    cb(null, []);
  });
  feedparser.on('end', () => {
    cb(null, posts);
  });
  feedparser.on('readable', () => {
    let post;
    while (post = feedparser.read()) {
      if (post && checkPost(post)) {
        posts.push(post);
      }
      //console.log(`${post.title} - ${post.link}`);
      //console.log(JSON.stringify(post, ' ', 2));
    }
  });
}

function maybeTranslate(res, charset) {
  let iconv;
  // Use iconv if its not utf8 already.
  if (!iconv && charset && !/utf-*8/i.test(charset)) {
    try {
      iconv = new Iconv(charset, 'utf-8');
      console.log('Converting from charset %s to utf-8', charset);
      iconv.on('error', done);
      // If we're using iconv, stream will be the output of iconv
      // otherwise it will remain the output of request
      res = res.pipe(iconv);
    } catch(err) {
      res.emit('error', err);
    }
  }

  return res;
}

function getParams(str) {
  const params = str.split(';').reduce((params, param) => {
    const parts = param.split('=').map(part => part.trim());
    if (parts.length === 2) {
      params[parts[0]] = parts[1];
    }
    return params;
  }, {});

  return params;
}

function tokenizeFilename(text) {
  const result = r.exec(text);
  if (!result) {
    return null;
  }

  const epWithV = (result[3] || '').split('v');
  let version = parseInt(epWithV[1]);
  if (isNaN(version)) {
    version = undefined;
  }

  return {
    originalFilename: text,
    group: result[1],
    show: result[2],
    episode: parseFloat(epWithV[0]),
    version: version
  };
}

function addTorrent(rt, link) {
  return new Promise((resolve, reject) => {
    rt.loadLink(link, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

function fetchFeeds(local) {
  let feeds = [];
  let rtorrent = { loadLink: () => {} };

  if (local) {
    let remotePort = server.address().port;
    for (var i = 1; i <= 10; i++) {
      feeds.push(`http://localhost:${remotePort}/nyaa-${i}.xml`);
    }
  } else {
    //feeds.push('http://www.nyaa.se/?page=rss&cats=1_37&filter=2');
    for (var i = 1; i < 10; i++) {
      feeds.push('http://www.nyaa.se/?page=rss&cats=1_37&filter=2&offset=' + i);
    }

    rtorrent = new Rtorrent({
      mode: 'xmlrpc',
      host: 'rutorrent.h.mbilker.us',
      port: 80,
      path: '/RPC2'
    });
  }

  async.concat(feeds, fetch, (err, res) => {
    const titles = res.map(obj => obj.title);
    const links = res.map(obj => obj.link);
    const regex = titles.map(tokenizeFilename);

    fs.readFile(path.resolve(__dirname, 'anime_list'), 'utf8', (err, text) => {
      const alreadyHave = text.trim().split('\n').map(tokenizeFilename);
      const diff = _.differenceWith(regex, alreadyHave, _.isEqual);

      const withLinks = diff.map(obj => {
        const index = regex.indexOf(obj);

        if (index === -1) {
          return new Error('why couldn\' we find the object in the original array!');
        }

        const original = regex[index];

        return Object.assign({}, obj, { link: links[index] });;
      });

      //console.log(diff);
      console.log(withLinks);

      const promises = withLinks.map((obj) => {
        return addTorrent(rtorrent, obj.link);
      });

      Promise.all(promises).then((responses) => {
        console.log(responses);
      }).catch((err) => {
        console.log(err);
        console.log(err.req && err.req._header);
        console.log(err.res && err.res.statusCode);
        console.log(err.body);
      });
    });
    console.log(titles);
    //console.log(regex);
    console.log(`end:`, err ? err.stack : null);

    server.close();
  });
  //fetch('http://www.nyaa.se/?page=rss&cats=1_37&filter=2');
}

// Don't worry about this. It's just a localhost file server so you can be
// certain the "remote" feed is available when you run this example.
var server = require('http').createServer((req, res) => {
  var stream = fs.createReadStream(path.resolve(__dirname, 'test-feeds', path.basename(req.url)));
  res.setHeader('Content-Type', 'text/xml; charset=UTF-8');
  stream.pipe(res);
});
server.listen(0, function() {
  //fetchFeeds(true);
});
fetchFeeds();
