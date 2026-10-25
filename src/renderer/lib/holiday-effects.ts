import type { Holiday } from './holidays';

const BAT =
    'M12 4.6c.6 0 1 .4 1.2 1 1.6-1.6 4.4-2.6 7.3-2.2-.9.7-1.2 1.6-.9 2.6-1-.6-2.1-.4-2.7.4-.7-.5-1.7-.3-2.2.4-.6-.4-1.5-.2-1.9.5L12 9.6l-.8-2.3c-.4-.7-1.3-.9-1.9-.5-.5-.7-1.5-.9-2.2-.4-.6-.8-1.7-1-2.7-.4.3-1 0-1.9-.9-2.6 2.9-.4 5.7.6 7.3 2.2.2-.6.6-1 1.2-1zM11.2 4.8l-.3-1.3.8.7h.6l.8-.7-.3 1.3z';

const between = (min: number, max: number) => min + Math.random() * (max - min);
const pick = <T>(items: T[]) => items[Math.floor(Math.random() * items.length)];

function spawn(x: number, y: number, style: Partial<CSSStyleDeclaration>) {
    const el = document.createElement('span');
    Object.assign(el.style, {
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
        pointerEvents: 'none',
        zIndex: '70',
        ...style,
    });
    document.body.append(el);
    return el;
}

function flyBat(x: number, y: number, path: [number, number][], duration: number, size: number) {
    const bat = spawn(x - size / 2, y - size / 4, {
        width: `${size}px`,
        filter: 'drop-shadow(0 0 1px rgb(251 146 60 / 0.9)) drop-shadow(0 0 6px rgb(251 146 60 / 0.6))',
    });
    bat.innerHTML = `<svg viewBox="0 0 24 12" style="display:block;width:100%;fill:#2a1640"><path d="${BAT}"/></svg>`;
    bat.firstElementChild?.animate(
        [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.3)' }, { transform: 'scaleY(1)' }],
        { duration: between(160, 220), iterations: Infinity }
    );
    const last = path.length - 1;
    bat.animate(
        path.map(([dx, dy], i) => ({
            transform: `translate(${dx}px, ${dy}px) scale(${0.7 + (0.5 * i) / last})`,
            opacity: i === 0 ? 0 : i === last ? 0 : 1,
            offset: i / last,
        })),
        { duration, easing: 'cubic-bezier(0.3, 0.5, 0.6, 1)', fill: 'forwards' }
    ).onfinish = () => bat.remove();
}

// A wobbly path from the origin out to (dx, dy)
function wobble(dx: number, dy: number, steps = 6): [number, number][] {
    return Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps;
        const jitter = i === 0 ? 0 : between(-14, 14);
        return [dx * t, dy * t + jitter];
    });
}

export function releaseBat() {
    const fromLeft = Math.random() < 0.5;
    const width = window.innerWidth;
    const y = between(20, Math.min(220, window.innerHeight / 3));
    const travel = width + 80;
    flyBat(
        fromLeft ? -40 : width + 40,
        y,
        wobble(fromLeft ? travel : -travel, between(-60, 60), 8),
        between(4500, 6500),
        between(24, 34)
    );
}

function batSwarm(x: number, y: number) {
    const reach = Math.hypot(window.innerWidth, window.innerHeight);
    for (let i = 0; i < 16; i++) {
        const angle = between(-0.05, 0.4) * Math.PI;
        const distance = reach * between(0.5, 1);
        setTimeout(
            () =>
                flyBat(
                    x,
                    y,
                    wobble(Math.cos(angle) * distance, Math.sin(angle) * distance, 8),
                    between(2600, 4000),
                    between(22, 34)
                ),
            i * 70
        );
    }
}

function snowFlurry() {
    for (let i = 0; i < 80; i++) {
        const size = `${between(3, 6)}px`;
        const flake = spawn(Math.random() * window.innerWidth, -8, {
            width: size,
            height: size,
            borderRadius: '50%',
            background: pick(['#ffffff', '#e0f2fe', '#bae6fd']),
        });
        const dx = between(-60, 60);
        const dy = window.innerHeight * between(0.5, 1);
        const sway = between(15, 40) * (Math.random() < 0.5 ? -1 : 1);
        flake.animate(
            [
                { transform: 'translate(0, 0)', opacity: 1 },
                { transform: `translate(${dx / 2 + sway}px, ${dy / 2}px)`, opacity: 0.9 },
                { transform: `translate(${dx}px, ${dy}px)`, opacity: 0 },
            ],
            {
                duration: between(3500, 6000),
                delay: Math.random() * 1500,
                easing: 'cubic-bezier(0.3, 0.4, 0.6, 1)',
                fill: 'backwards',
            }
        ).onfinish = () => flake.remove();
    }
}

export function firework(x: number, y: number) {
    const colors = pick([
        ['#fde68a', '#fcd34d', '#fff7d6'],
        ['#f9a8d4', '#f472b6', '#fde68a'],
        ['#a5f3fc', '#67e8f9', '#ffffff'],
        ['#d9ceff', '#b9a6ff', '#fde68a'],
    ]);
    const sparks = 44;
    for (let i = 0; i < sparks; i++) {
        const color = pick(colors);
        const size = `${between(3, 5)}px`;
        const spark = spawn(x, y, {
            width: size,
            height: size,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 8px 2px ${color}`,
        });
        // Every other spark forms a slower inner ring
        const angle = (i / sparks) * Math.PI * 4 + between(-0.1, 0.1);
        const speed = i % 2 ? between(55, 85) : between(100, 150);
        const dx = Math.cos(angle) * speed;
        const dy = Math.sin(angle) * speed;
        const fall = between(60, 90);
        spark.animate(
            [
                { transform: 'translate(0, 0) scale(1)', opacity: 1 },
                { transform: `translate(${dx}px, ${dy}px) scale(1)`, opacity: 1, offset: 0.35 },
                {
                    transform: `translate(${dx * 1.15}px, ${dy * 1.15 + fall / 2}px) scale(0.8)`,
                    opacity: 0.9,
                    offset: 0.65,
                },
                {
                    transform: `translate(${dx * 1.25}px, ${dy * 1.25 + fall}px) scale(0.3)`,
                    opacity: 0,
                },
            ],
            { duration: between(2200, 3000), easing: 'cubic-bezier(0.1, 0.7, 0.3, 1)' }
        ).onfinish = () => spark.remove();
    }
}

export function newYearShow(delay = 0) {
    for (let i = 0; i < 5; i++) {
        setTimeout(
            () => firework(window.innerWidth * between(0.2, 0.8), between(120, 280)),
            delay + i * 600
        );
    }
}

// Bats leave from the header logo; the other effects cover the whole window
export function celebrate(holiday: Holiday) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (holiday === 'HALLOWEEN') {
        const logo = document.querySelector('[data-holiday-logo]')?.getBoundingClientRect();
        batSwarm(logo ? logo.left + logo.width / 2 : 30, logo ? logo.top + logo.height / 2 : 28);
    } else if (holiday === 'CHRISTMAS') snowFlurry();
    else newYearShow();
}
