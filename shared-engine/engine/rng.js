// Générateur pseudo-aléatoire DÉTERMINISTE à graine (algorithme mulberry32).
// Toute l'aléa du jeu passe par ici afin que le reducer reste une fonction PURE :
// une même (state, action) produit toujours le même résultat, côté client comme
// côté serveur. C'est indispensable au mode « online » (rejeu/vérification de
// l'état, prédiction client) — `Math.random()` global le rendrait impossible.
//
// La graine tient en un entier 32 bits : elle est donc sérialisable et voyage
// dans l'état (`state.rngSeed`). Chaque appel du reducer crée un générateur
// LOCAL à partir de cette graine, le consomme, puis persiste sa graine finale
// dans le nouvel état. La mutation reste confinée à ce générateur éphémère.

export function makeRng(seed) {
    let s = seed >>> 0; // graine courante, forcée en entier 32 bits non signé
    // Prochain flottant dans [0, 1).
    const next = () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
        next,
        // Entier dans [0, n) (tirage uniforme d'un indice).
        int: (n) => Math.floor(next() * n),
        // Graine courante, à réinjecter dans l'état après consommation.
        get seed() {
            return s >>> 0;
        },
    };
}

// Graine initiale non reproductible pour une partie locale. Le serveur du mode
// « online » fournira sa propre graine (via l'action) pour que tous les clients
// rejouent la partie à l'identique.
export function randomSeed() {
    return Math.floor(Math.random() * 0x100000000) >>> 0;
}
