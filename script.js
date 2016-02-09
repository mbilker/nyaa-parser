"use strict";

const fs = require('fs');
const path = require('path');
const async = require('async');
const request = require('request');
const FeedParser = require('feedparser');
const Iconv = require('iconv').Iconv;
const clc = require('cli-color');

function checkPost(post) {
  const shows = [
    /Hiryuu.*Hai to Gensou no Grimgar/i,
    /DameDesuYo.*Dimension W/i,
    /GJM.*Boku dake ga Inai Machi/i,
    /Mori.*Dagashi Kashi/i
  ];
  const testResult = shows.some(regex => regex.test(post.title));
  const color = testResult ? clc.green('true') : clc.red('false');

  console.log(`${color} ${post.title} - ${post.guid}`);

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
  req.on('error', cb);
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
  feedparser.on('error', cb);
  feedparser.on('end', () => {
    console.log(`${feed} end event`);
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

function fetchFeeds(local) {
  let feeds = [];

  if (local) {
    let remotePort = server.address().port;
    for (var i = 1; i < 4; i++) {
      feeds.push(`http://localhost:${remotePort}/nyaa-${i}.xml`);
    }
  } else {
    feeds.push('http://www.nyaa.se/?page=rss&cats=1_37&filter=2');
    for (var i = 2; i < 4; i++) {
      feeds.push('http://www.nyaa.se/?page=rss&cats=1_37&filter=2&offset=' + i);
    }
  }

  async.concat(feeds, (feed, cb) => {
    console.log(feed);
    fetch(feed, cb);
    //cb();
  }, (err, res) => {
    let titles = res.map((obj) => obj.title);
    console.log(titles);
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
  //fetch('http://localhost:' + server.address().port + '/nyaa.xml', () => {});
  fetchFeeds(true);
});

//fetchFeeds();
