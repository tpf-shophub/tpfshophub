const express = require('express');
const { fetchCategories, createCategory, fetchAllCategories, deleteCategory } = require('../controller/Category');

const router = express.Router();
//  /categories is already added in base path
router.get('/', fetchCategories).post('/',createCategory).get('/fetchAllCategories', fetchAllCategories).delete('/:id', deleteCategory);

exports.router = router;
