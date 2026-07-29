import {useState} from 'react';
import {WIKI_CATEGORIES, WIKI_ENTRY_COUNT} from './wikiEntries.js';
import WikiCarousel from './WikiCarousel.jsx';

const WikiSection = () => {
    const [activeCategoryId, setActiveCategoryId] = useState(WIKI_CATEGORIES[0].id);
    const activeCategory =
        WIKI_CATEGORIES.find((category) => category.id === activeCategoryId) ??
        WIKI_CATEGORIES[0];

    return (
        <section className="wiki" aria-labelledby="wiki-title">
            <div className="wiki__heading">
                <div>
                    <span className="wiki__kicker">ARCHIVES DU ROYAUME</span>
                    <h2 id="wiki-title">Le codex de Conquest</h2>
                </div>
                <p>
                    <strong>{WIKI_ENTRY_COUNT} fiches</strong>
                    Tout ce qu’il faut savoir avant de partir à la conquête de
                    l’hexagone.
                </p>
            </div>

            <div className="wiki__tabs" role="tablist" aria-label="Catégories du codex">
                {WIKI_CATEGORIES.map((category) => {
                    const selected = category.id === activeCategory.id;
                    return (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={selected}
                            className={`wiki__tab${selected ? ' wiki__tab--active' : ''}`}
                            key={category.id}
                            onClick={() => setActiveCategoryId(category.id)}
                        >
                            <span>{category.shortLabel}</span>
                            <small>{category.entries.length}</small>
                        </button>
                    );
                })}
            </div>

            <WikiCarousel key={activeCategory.id} category={activeCategory} />
        </section>
    );
};

export default WikiSection;
