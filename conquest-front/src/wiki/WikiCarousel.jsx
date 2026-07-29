/* eslint-disable react/prop-types */

import {useRef, useState} from 'react';
import WikiCard from './WikiCard.jsx';

const WikiCarousel = ({category}) => {
    const trackRef = useRef(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const entries = category.entries;

    const goTo = (nextIndex) => {
        const index = Math.max(0, Math.min(entries.length - 1, nextIndex));
        const card = trackRef.current?.children[index];
        if (!card || !trackRef.current) return;
        trackRef.current.scrollTo({
            left:
                card.offsetLeft
                + card.offsetWidth / 2
                - trackRef.current.clientWidth / 2,
            behavior: 'smooth',
        });
        setActiveIndex(index);
    };

    const updateActiveCard = () => {
        const track = trackRef.current;
        if (!track) return;
        if (!track.children[0]) return;
        const trackCenter = track.scrollLeft + track.clientWidth / 2;
        let closestIndex = 0;
        let closestDistance = Number.POSITIVE_INFINITY;
        Array.from(track.children).forEach((card, index) => {
            const cardCenter = card.offsetLeft + card.offsetWidth / 2;
            const distance = Math.abs(trackCenter - cardCenter);
            if (distance < closestDistance) {
                closestDistance = distance;
                closestIndex = index;
            }
        });
        setActiveIndex(closestIndex);
    };

    const onKeyDown = (event) => {
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            goTo(activeIndex - 1);
        }
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            goTo(activeIndex + 1);
        }
    };

    return (
        <div
            className="wiki-carousel"
            role="region"
            aria-roledescription="carousel"
            aria-label={category.label}
            tabIndex={0}
            onKeyDown={onKeyDown}
        >
            <div className="wiki-carousel__stage">
                <button
                    className="wiki-carousel__nav wiki-carousel__nav--prev"
                    type="button"
                    onClick={() => goTo(activeIndex - 1)}
                    disabled={activeIndex === 0}
                    aria-label="Carte précédente"
                >
                    <span aria-hidden="true">←</span>
                </button>

                <div
                    className="wiki-carousel__track"
                    ref={trackRef}
                    onScroll={updateActiveCard}
                >
                    {entries.map((entry, index) => (
                        <div className="wiki-carousel__slide" key={entry.id}>
                            <WikiCard entry={entry} active={index === activeIndex} />
                        </div>
                    ))}
                </div>

                <button
                    className="wiki-carousel__nav wiki-carousel__nav--next"
                    type="button"
                    onClick={() => goTo(activeIndex + 1)}
                    disabled={activeIndex === entries.length - 1}
                    aria-label="Carte suivante"
                >
                    <span aria-hidden="true">→</span>
                </button>
            </div>

            <div className="wiki-carousel__progress" aria-hidden="true">
                <span
                    style={{width: `${((activeIndex + 1) / entries.length) * 100}%`}}
                />
            </div>
        </div>
    );
};

export default WikiCarousel;
