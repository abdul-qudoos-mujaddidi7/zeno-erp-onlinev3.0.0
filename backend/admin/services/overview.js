exports.getOverview = (labels) => ({
  title: labels.overview,
  areas: [labels.organizations, labels.subscriptions, labels.billing, labels.support],
});
