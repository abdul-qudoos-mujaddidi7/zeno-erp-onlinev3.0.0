const productCategoryService =
  require('../services/product-category.service');

const {
  getRequestContext,
} = require('../utils/requestContext');

async function list(req, res) {
  const categories =
    await productCategoryService.listCategories({
      user: req.user,
      filters: req.validated.query,
    });

  res.status(200).json({
    success: true,
    data: categories,
  });
}

async function getById(req, res) {
  const category =
    await productCategoryService.getCategory({
      user: req.user,
      categoryId: req.validated.params.id,
    });

  res.status(200).json({
    success: true,
    data: category,
  });
}

async function create(req, res) {
  const category =
    await productCategoryService.createCategory({
      user: req.user,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(201).json({
    success: true,
    message:
      'Product category created successfully.',
    data: category,
  });
}

async function update(req, res) {
  const category =
    await productCategoryService.updateCategory({
      user: req.user,
      categoryId: req.validated.params.id,
      data: req.validated.body,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Product category updated successfully.',
    data: category,
  });
}

async function remove(req, res) {
  const category =
    await productCategoryService.deleteCategory({
      user: req.user,
      categoryId: req.validated.params.id,
      requestContext:
        getRequestContext(req),
    });

  res.status(200).json({
    success: true,
    message:
      'Product category deleted successfully.',
    data: category,
  });
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};