const express = require('express');
const { fetchBrands, createBrand, fetchAllBrands, deleteBrand } = require('../controller/Brand');

const router = express.Router();
//  /brands is already added in base path
router.get('/', fetchBrands).post('/', createBrand).get('/fetchAllBrands', fetchAllBrands).delete('/:id', deleteBrand);

exports.router = router;
