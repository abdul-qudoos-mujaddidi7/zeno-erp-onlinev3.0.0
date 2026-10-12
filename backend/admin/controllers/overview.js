const overview = require('../services/overview');
const { preferences } = require('../validators/preferences');

exports.show = (req, res) => res.render('overview', overview.getOverview(res.locals.labels));
exports.updateLanguage = (req, res) => {
  const parsed = preferences.safeParse(req.body);
  if (!parsed.success) return res.status(400).render('restricted', {
    layout: 'auth', title: res.locals.labels.restricted, message: res.locals.labels.invalid,
  });
  req.session.language = parsed.data.language;
  req.session.save((error) => {
    if (error) return res.status(500).render('restricted', {
      layout: 'auth', title: res.locals.labels.unavailable, message: res.locals.labels.error,
    });
    res.redirect(303, '/superadmin');
  });
};
