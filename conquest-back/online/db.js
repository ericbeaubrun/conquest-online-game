// Connexion MongoDB (singleton). Le serveur y stocke les lobbies et l'état
// sérialisé des parties, de sorte qu'un redémarrage NE perd PAS les parties en
// cours (persistance). URI et nom de base surchargeables par variables
// d'environnement pour le déploiement.
import 'dotenv/config';
import {MongoClient} from 'mongodb';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB || 'conquest';

// Retire les identifiants d'une URI de connexion : `//utilisateur:motdepasse@`
// devient `//***@`. Une URI de production part dans les logs de l'hébergeur
// (Render), qui ne sont ni éphémères ni forcément privés — le mot de passe du
// cluster n'a rien à y faire. Le reste de l'URI (hôte, options) est conservé :
// c'est ce qui rend le message utile au diagnostic.
//
// S'applique aussi aux messages d'ERREUR du driver, qui recrachent volontiers
// l'URI complète telle qu'elle lui a été passée.
export const maskCredentials = (text) => String(text).replace(/\/\/[^/@\s]+@/g, '//***@');

// URI expurgée, seule forme AFFICHABLE. C'est elle qu'exporte ce module : rien
// à l'extérieur n'a besoin de l'URI en clair (le driver, lui, la lit ici même).
const SAFE_URI = maskCredentials(URI);

let client = null;
let db = null;

// À appeler UNE fois au démarrage (avant d'écouter). Lève une erreur claire si
// MongoDB est injoignable — au serveur appelant de décider quoi en faire.
export async function connectDb() {
    client = new MongoClient(URI, {serverSelectionTimeoutMS: 3000});
    await client.connect();
    db = client.db(DB_NAME);
    // Index pour lister rapidement les parties ouvertes, plus récentes d'abord.
    await db.collection('lobbies').createIndex({status: 1, updatedAt: -1});
    // Purge automatique des parties INERTES. L'échéance est portée par le
    // document (`expiresAt`, posée par `lobbyStore` quand une partie devient
    // 'over' ou 'saved') plutôt que par l'index : MongoDB refuse deux index TTL
    // sur la même clé ne différant que par leur filtre partiel, on ne pourrait
    // donc pas donner deux durées distinctes autrement. `expireAfterSeconds: 0`
    // signifie « expire à la date inscrite ». Un document sans `expiresAt` (ou
    // à `null`) est ignoré par le TTL : une partie vivante ne s'efface jamais.
    await db
        .collection('lobbies')
        .createIndex({expiresAt: 1}, {expireAfterSeconds: 0, name: 'ttl_expiresAt'});
    // eslint-disable-next-line no-console
    console.log(`MongoDB connecté : ${SAFE_URI} (base « ${DB_NAME} »)`);
    return db;
}

export function getDb() {
    if (!db) throw new Error('MongoDB non connecté : appelez connectDb() au démarrage.');
    return db;
}

// Collection des lobbies/parties.
export function lobbiesCol() {
    return getDb().collection('lobbies');
}

export async function closeDb() {
    if (client) await client.close();
    client = null;
    db = null;
}

export {SAFE_URI as MONGODB_URI_SAFE};
