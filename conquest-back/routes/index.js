import express from 'express';

const router = express.Router();

/* Page d'accueil : redirige vers la page de test du mode online. */
router.get('/', function (req, res) {
    res.redirect('/test.html');
});

export default router;
