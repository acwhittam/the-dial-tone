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

const buildMarkdown = ([obj, response]) => {
  const { link } = obj;
  const { data } = response;
  const { host } = url.parse(link);

  let title = data !== 'Error' ? getTitle(cheerio.load(data)) : 'Error';

  if (R.test(/;<\/x>/, data)) {
    title = (R.compose(
      R.path(['payload', 'value', 'title']),
      JSON.parse,
      R.dropWhile(x => x !== '{'),
    )(data));
  }
  title = R.replace(/\|/g, '-', title);
  return (R.set(R.lensProp('markdown'), `* [${title}](${link}) [${host}]`, obj));
};

const run = async function (data, filter = 'all') {
  const objects = (R.compose(
    R.when(R.always(filter !== 'all'), R.filter(R.propEq('issue', filter))),
    R.map(
      R.compose(
        ([link, topic, issue]) => ({
          link,
          topic,
          issue,
        }),
        R.map(R.trim),
        R.split(/\|/),
      ),
    ),
    R.reject(R.isEmpty),
    R.split(/\n/),
  )(data));


  let responses;
  let requests;
  const get = R.compose(
    R.otherwise(() => ({ data: 'Error' })),
    axios.get,
  );
  try {
    requests = (R.map(R.compose(get, R.prop('link')))(objects));
    responses = await Promise.all(requests);
  } catch (err) {
    console.log(err);
  }

  const results = (R.compose(
    R.map(buildMarkdown),
    R.zip(objects),
  )(responses));

  const markdown = (R.compose(
    R.reduce((acc, value) => {
      const md = (R.compose(
        R.prepend('\n'),
        R.prepend(`## ${value}`),
        R.pluck('markdown'),
        R.filter(R.propEq('topic', value)),
      )(results));

      return R.concat(acc, md);
    }, []),
    R.sortBy(R.cond([
      [R.equals('The Speed Dial'), R.always(1)],
      [R.equals('Management/Culture'), R.always(2)],
      [R.equals('Development/Releases'), R.always(3)],
      [R.equals('Technical'), R.always(4)],
      [R.equals('News/Other'), R.always(5)],
      [R.equals('Books/Podcasts/Videos'), R.always(6)],
      [R.T, R.always(10)],

    ])),
    R.uniq,
    R.pluck('topic'),
  )(objects));

  process.stdout.write(
    `# ${filter} \n`,
  );
  process.stdout.write(
    markdown.join('\n'),
  );
};

run(fs.readFileSync(args.i, 'utf8'), args.f);
