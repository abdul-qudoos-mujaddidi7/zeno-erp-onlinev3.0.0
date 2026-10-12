module.exports = (service) => ({
  ...require("./crud.controller")(service, "subscription-plans"),
  async features(req, res) {
    res.json(await service.features(req.params.planId));
  },
});
