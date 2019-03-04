const R = require('ramda');
const cheerio = require('cheerio');
const url = require('url');
const args = require('minimist')(process.argv.slice(2));
const fs = require('fs');
const axios = require('axios');

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

const buildMarkdown = function ([link, response]) {
  const { data } = response;
  const { host } = url.parse(link);
  const $ = cheerio.load(data);
  let title = getTitle($);

  if (R.test(/;<\/x>/, data)) {
    title = (R.compose(
      R.path(['payload', 'value', 'title']),
      JSON.parse,
      R.dropWhile(x => x !== '{'),
    )(data));
  }

  return `* [${title}](${link}) [${host}]`;
};

const run = async function (data) {
  const lines = R.compose(R.map(R.split(/\s+/)), R.reject(R.isEmpty), R.split(/\n/))(data);
  const links = (R.map(R.nth(0))(lines));
  const topics = (R.map(R.nth(1))(lines));

  let responses;
  let requests;

  try {
    requests = (R.map(axios.get)(links));
    responses = await Promise.all(requests);
  } catch (err) {
    console.log(err);
  }

  const results = R.compose(
    R.zip(topics),
    R.map(buildMarkdown),
    R.zip(links),
  )(responses);

  const markdown = (R.compose(
    R.reduce((acc, value) => {
      const md = (R.compose(
        R.prepend(`## ${value}`),
        R.map(R.nth(1)),
        R.filter(R.compose(R.equals(value), R.nth(0))),
      )(results));

      return R.concat(acc, md);
    }, []),
    R.uniq,
  )(topics));


  process.stdout.write(
    markdown.join('\n'),
  );
};

run(fs.readFileSync(args.i, 'utf8'));
