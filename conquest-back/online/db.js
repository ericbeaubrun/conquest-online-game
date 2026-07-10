// Connexion MongoDB (singleton). Le serveur y stocke les lobbies et l'état
// sérialisé des parties, de sorte qu'un redémarrage NE perd PAS les parties en
// cours (persistance). URI et nom de base surchargeables par variables
// d'environnement pour le déploiement.
import 'dotenv/config';
import {MongoClient} from 'mongodb';

const URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DB || 'conquest';

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
    // eslint-disable-next-line no-console
    console.log(`MongoDB connecté : ${URI} (base « ${DB_NAME} »)`);
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

export {URI as MONGODB_URI};
