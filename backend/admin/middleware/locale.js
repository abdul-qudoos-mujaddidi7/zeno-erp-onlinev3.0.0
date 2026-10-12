const { language } = require('../validators/preferences');
const dictionaries = require('../services/translations');

exports.locale = (req, res, next) => {
  const chosen = language.safeParse(req.query.lang ?? req.session?.language ?? 'en');
  const code = chosen.success ? chosen.data : 'en';
  res.locals.labels = dictionaries[code];
  res.locals.language = code;
  res.locals.htmlLanguage = { en: 'en', fa: 'fa-AF', ps: 'ps-AF' }[code];
  res.locals.direction = code === 'en' ? 'ltr' : 'rtl';
  res.locals.rtl = code !== 'en';
  res.locals.languages = [
    { code: 'en', name: 'English', selected: code === 'en' },
    { code: 'fa', name: 'دری', selected: code === 'fa' },
    { code: 'ps', name: 'پښتو', selected: code === 'ps' },
  ];
  next();
};
