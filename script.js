'use strict';

const request = require('request');
const FeedParser = require('feedparser');
const Iconv = require('iconv').Iconv;
const clc = require('cli-color');

function checkPost(post) {
  const shows = [
    /Hai to Gensou no Grimgar/i,
    /DameDesuYo.*Dimension W/i,
    /Boku dake ga Inai Machi/i
  ];
  const testResult = shows.some(regex => regex.test(post.title));
  const color = testResult ? clc.green('true') : clc.red('false');

  console.log(`${color} ${post.title} - ${post.guid}`);
}

function fetch(feed) {
  // Define our streams
  const req = request(feed, {timeout: 10000, pool: false});
  req.setMaxListeners(50);
  // Some feeds do not respond without user-agent and accept headers.
  req.setHeader('user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36');
  req.setHeader('accept', 'text/html,application/xhtml+xml');

  const feedparser = new FeedParser();

  // Define our handlers
  req.on('error', done);
  req.on('response', res => {
    if (res.statusCode != 200) {
      return req.emit('error', new Error('Bad status code'));
    }

    const charset = getParams(res.headers['content-type'] || '').charset;
    res = maybeTranslate(res, charset);
    // And boom goes the dynamite
    res.pipe(feedparser);
  });

  feedparser.on('error', done);
  feedparser.on('end', done);
  feedparser.on('readable', () => {
    var post;
    while (post = feedparser.read()) {
      checkPost(post);
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

function done(err) {
  if (err) {
    console.log(err);
    console.error(err.stack);
    return process.exit(1);
  }
  //server.close();
  process.exit();
}

// Don't worry about this. It's just a localhost file server so you can be
// certain the "remote" feed is available when you run this example.
var server = require('http').createServer((req, res) => {
  var stream = require('fs').createReadStream(require('path').resolve(__dirname, 'test-feeds', 'nyaa.xml'));
  res.setHeader('Content-Type', 'text/xml; charset=UTF-8');
  stream.pipe(res);
});
server.listen(0, function() {
  fetch('http://localhost:' + server.address().port + '/nyaa.xml');
  //setImmediate(() => server.close());
});
//fetch('http://www.nyaa.se/?page=rss&cats=1_37&filter=2');
