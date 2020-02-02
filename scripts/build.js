const R = require('ramda');
const cheerio = require('cheerio');
const url = require('url');
const args = require('minimist')(process.argv.slice(2));
const fs = require('fs');
const { Future, parallel } = require('fluture');

const fetch = require('node-fetch');

const get = obj => Future((reject, resolve) => {
  fetch(obj.link)
    .then((res) => {
      if (res.ok) {
        return res;
      }
      throw new Error(res.status);
    })
    .then(res => res.text())
    .then((text) => {
      resolve(R.assoc('data', text, obj));
    })
    .catch(() => {
      resolve(R.assoc('data', 'Error', obj));
    });
  setTimeout(() => {
    resolve(R.assoc('data', 'Error', obj));
  }, 5000);
});

const textOf = R.curry((selector, $) => {
  const select = $(selector);
  const value = select.text();
  return R.isNil(value) ? false : value;
});

const contentOf = R.curry((selector, $) => {
  const select = $(selector);
  const value = select.attr('content');
  return R.isNil(value) ? false : value;
});

const getTitle = function ($) {
  return (R.compose(
    R.trim,
    R.cond(
      [
        [contentOf("meta[property='og:title']"), contentOf("meta[property='og:title']")],
        [contentOf("meta[property='twitter:title']"), contentOf("meta[property='twitter:title']")],
        [contentOf("meta[property='title']"), contentOf("meta[property='title']")],
        [textOf('title'), textOf('title')],
        [textOf('h1.title'), textOf('h1.title')],
        [textOf('h1'), textOf('h1')],
        [R.T, R.always('unknown')],
      ],
    ),
  )($));
};

const buildMarkdown = (obj) => {
  const { link, data } = obj;
  const { host } = url.parse(link);

  let title = data !== 'Error' ? getTitle(cheerio.load(data)) : data;

  if (R.test(/;<\/x>/, data)) {
    title = (R.compose(
      R.path(['payload', 'value', 'title']),
      JSON.parse,
      R.dropWhile(x => x !== '{'),
    )(data));
  }
  title = R.replace(/\|/g, '-', title);
  const md = title !== 'Error'
    ? `* [${title}](${link}) [${host}]`
    : `* &#9888; [${link}](${link}) [${host}]`;
  return (R.assoc('markdown', md, obj));
};


const processLine = R.compose(
  ([link, topic, issue]) => ({ link, topic, issue }),
  R.map(R.trim),
  R.split(/\|/),
);
const topicScore = R.compose(
  R.cond([
    [R.equals('The Speed Dial'), R.always(1)],
    [R.equals('Management/Culture'), R.always(2)],
    [R.equals('Development/Releases'), R.always(3)],
    [R.equals('Technical'), R.always(4)],
    [R.equals('News/Other'), R.always(5)],
    [R.equals('Books/Podcasts/Videos'), R.always(6)],
    [R.T, R.always(10)],
  ]),
  R.prop('topic'),
);

const { f: filterTag, i: filePath } = args;

const futures = R.compose(
  R.chain(R.map(buildMarkdown)),
  R.map(get),
  R.when(R.always(filterTag !== 'all'), R.filter(R.propEq('issue', filterTag))),
  R.sortBy(topicScore),
  R.map(processLine),
  R.reject(R.isEmpty),
  R.split(/\n/),
)(fs.readFileSync(filePath, 'utf8'));

parallel(Infinity)(futures).fork(
  (err) => {
    console.log(err);
  },
  R.compose(
    (markdown) => {
      process.stdout.write(markdown);
      process.exit();
    },
    R.join('\n'),
    R.prepend(`# ${filterTag}`),
    R.append('___\n[home](index.md\n'),
    R.flatten,
    R.values,
    R.mapObjIndexed((value, topic) => (R.compose(
      R.prepend(`\n ## ${topic}`),
      R.pluck('markdown'),
    )(value))),
    R.groupBy(R.prop('topic')),
  ),
);
