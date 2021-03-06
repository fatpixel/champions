import Champion from '../data/model/Champion';
import lang from '../service/lang';
import app from '../service/app';
import { notify } from '../util/notification';
import dataSynergies from '../data/synergies';
import { SPECIAL_EFFECTS } from '../data/effects';
import roster from './roster';
import router from './router';
import { fromStorage, toStorage } from '../util/storage';
import Worker from 'webworker!./teams/worker';
import { requestRedraw } from '../util/animation';

const PRESETS = {
    'offensive': {
        'effect-attack': 0.6,
        'effect-idol': 0.6,
        'effect-inseparable': 0.6,
        'effect-mutantagenda': 0.6,
        'effect-critrate': 0.4,
        'effect-critdamage': 0.4,
        'effect-stun': 0.5,
        'effect-powergain': 0.2,
        'effect-powersteal': 0.2,
        'effect-perfectblock': 0.1,
        'effect-block': 0.1,
        'effect-armor': 0.1,
        'effect-health': 0.1,
        'effect-healthsteal': 0.2,
        'effect-heroesforhire': 0.2,
        'effect-thunderbolts': 0.2,
    },
    'balanced': {
        'effect-attack': 0.5,
        'effect-idol': 0.5,
        'effect-inseparable': 0.5,
        'effect-mutantagenda': 0.5,
        'effect-critrate': 0.5,
        'effect-critdamage': 0.5,
        'effect-stun': 0.5,
        'effect-powergain': 0.5,
        'effect-powersteal': 0.5,
        'effect-perfectblock': 0.5,
        'effect-block': 0.5,
        'effect-armor': 0.5,
        'effect-health': 0.5,
        'effect-healthsteal': 0.5,
        'effect-heroesforhire': 0.5,
        'effect-thunderbolts': 0.5,
    },
    'defensive': {
        'effect-attack': 0.1,
        'effect-idol': 0.3,
        'effect-inseparable': 0.1,
        'effect-mutantagenda': 0.1,
        'effect-critrate': 0.1,
        'effect-critdamage': 0.1,
        'effect-stun': 0.5,
        'effect-powergain': 0.3,
        'effect-powersteal': 0.3,
        'effect-perfectblock': 0.8,
        'effect-block': 0.7,
        'effect-armor': 0.7,
        'effect-health': 0.5,
        'effect-healthsteal': 0.5,
        'effect-heroesforhire': 0.5,
        'effect-thunderbolts': 0.6,
    },
};

const PRESETS_DUPLICATES = {
    'all': {
        'duplicates-2': 1,
        'duplicates-3': 1,
        'duplicates-4': 1,
        'duplicates-5': 1,
    },
    'balanced': {
        'duplicates-2': 0.8,
        'duplicates-3': 0.4,
        'duplicates-4': 0.2,
        'duplicates-5': 0.1,
    },
    'none': {
        'duplicates-2': 0,
        'duplicates-3': 0,
        'duplicates-4': 0,
        'duplicates-5': 0,
    },
};

const PRESETS_RANGE = {
    'all': {
        'minimum-champion': 0,
        'maximum-champion': 10000,
        'minimum-team': 0,
        'maximum-team': 50000,
    },
    'streak': {
        'minimum-team': 4000,
        'maximum-team': 4500,
    },
};

const DEFAULT_RANGE = {
    ...PRESETS_RANGE[ 'all' ],
};

const DEFAULT_WEIGHTS = {
    ...PRESETS_DUPLICATES[ 'balanced' ],
    ...PRESETS[ 'offensive' ],
};

const teams = {
    type: 'arena',
    size: 3,
    stars: {
        1: true,
        2: true,
        3: true,
        4: true,
        5: true,
    },
    types:{
        cosmic: true,
        tech: true,
        mutant: true,
        skill: true,
        science: true,
        mystic: true,
    },
    weights: {
        ...DEFAULT_WEIGHTS,
    },
    range: {
        ...DEFAULT_RANGE,
    },
    ...fromStorage('teams', {}),
    progress: 0,
    building: false,
    result: {},
};

// Apply missing defaults
Object.keys(DEFAULT_WEIGHTS).forEach((key) => {
    if(!(key in teams.weights)) {
        teams.weights[ key ] = DEFAULT_WEIGHTS[ key ];
    }
});
Object.keys(DEFAULT_RANGE).forEach((key) => {
    if(!(key in teams.range)) {
        teams.range[ key ] = DEFAULT_RANGE[ key ];
    }
});

//assign missing fields a default value.
for(const key in DEFAULT_WEIGHTS) {
    if(teams.weights[ key ] === undefined) {
        teams.weights[ key ] = DEFAULT_WEIGHTS[ key ];
    }
}

function save() {
    toStorage('teams', {
        type: teams.type,
        size: teams.size,
        stars: teams.stars,
        types: teams.types,
        weights: teams.weights,
        range: teams.range,
    });
}

function loadTeam(type, size) {
    if(type === 'arena') {
        return;
    }
    const champions = roster.filter((champion) => champion && champion.attr.role === type);
    if(champions.length === size) {
        champions.sort();
        const synergies = synergiesFromChampions(champions);
        teams.result[ `${ type }-${ size }` ] = {
            teams: [
                {
                    champions,
                    synergies,
                },
            ],
            counts: {
                teams: 1,
                synergies: synergies.length,
            },
            extras: [],
        };
    }
    else {
        teams.result[ `${ type }-${ size }` ] = null;
    }
}

[
    { type: 'alliance-war-attack', size: 3 },
    { type: 'alliance-war-defense', size: 5 },
    { type: 'alliance-quest', size: 3 },
].forEach(({ type, size }) => loadTeam(type, size));

function saveTeam() {
    teams.last = Date.now();
    if(teams.type === 'arena' || teams.type === 'quest') {
        return;
    }
    const result = teams.result[ `${ teams.type }-${ teams.size }` ];
    const champions = result && result.teams && result.teams[ 0 ] && result.teams[ 0 ].champions;
    roster.setTeam(teams.type, champions || []);
}

function idToRosterChampion(id) {
    const { uid, stars } = Champion.idToObject(id);
    return roster.filter(({ attr }) => attr.uid === uid && attr.stars === stars)[ 0 ];
}

function synergiesFromChampions(team) {
    const specials = {};
    const champions = team.reduce((array, champion) => {
        if(champion) {
            return [
                ...array,
                champion,
            ];
        }
        return array;
    }, []);
    return dataSynergies.filter((synergy) => {
        const { fromId, fromStars, toId } = synergy.attr;
        if (!champions.find(({ attr }) => fromId === attr.uid && fromStars === attr.stars))
            return false;
        return Boolean(champions.find(({ attr }) => toId === attr.uid));

    }).filter(({ attr }) => {
        if(SPECIAL_EFFECTS[ attr.effectId ]) {
            const specialId = `${ attr.fromId }-${ attr.fromStars }-${ attr.effectId }`;
            if(specials[ specialId ]) {
                return false;
            }
            specials[ specialId ] = true;
        }
        return true;
    });
}

let progressResetTimeout;

let worker;
function buildTeam() {
    new Promise((resolve) => {
        if(worker)
            worker.terminate();
        worker = new Worker();
        worker.onmessage = (event) => {
            switch(event.data.type) {
            case 'result':
                teams.progress = 1;
                setTimeout(() => resolve(event.data.data), 50);
                requestRedraw();
                break;
            case 'progress':
                const progress = event.data.data;
                teams.progress = progress.current / progress.max;
                requestRedraw(teams.progress > 0 && teams.progress < 1? 5: 0);
                break;
            }
        };
        worker.postMessage({
            type: 'build',
            data: {
                type: teams.type,
                champions: roster
                    .filter(({ attr }) => teams.types[ attr.typeId ] !== false)
                    .filter(({ attr }) => teams.stars[ attr.stars ] !== false)
                    .filter((champion) => {
                        const pi = champion.attr.pi || champion.pi;
                        return teams.range[ 'minimum-champion' ] <= pi && teams.range[ 'maximum-champion' ] >= pi;
                    })
                    .filter(
                        teams.type !== 'arena'? ({ attr }) => !attr.role || attr.role === 'arena' || attr.role === teams.type:
                        () => true
                    )
                    .map((champion) => champion.attr),
                size: teams.size,
                weights: {
                    ...teams.weights,
                },
                range: {
                    ...teams.range,
                },
            },
        });
        teams.building = true;
        teams.progress = 0;
        clearTimeout(progressResetTimeout);
    })
    .then((result) => {
        let teamsCount = 0;
        let synergiesCount = 0;
        teams.result[ `${ teams.type }-${ teams.size }` ] = {
            ...result,
            teams: result.teams.map((team) => {
                team.sort();
                const champions = team.map(idToRosterChampion);
                const synergies = synergiesFromChampions(champions);
                teamsCount++;
                synergiesCount += synergies.length;
                return {
                    champions,
                    synergies,
                };
            }),
            counts: {
                teams: teamsCount,
                synergies: synergiesCount,
            },
            extras: result.extras.map(idToRosterChampion),
        };
        saveTeam();
        teams.building = false;
        requestRedraw();
        return new Promise((resolve) => progressResetTimeout = setTimeout(resolve, 250));
    })
    .then(() => {
        teams.progress = 0;
        requestRedraw();
        notify({
            message: lang.get('notification-team-built'),
            tag: 'team-built',
            onclick: () => {
                app.menuOpen = false;
                router.setRoute('/teams');
                requestRedraw();
            },
        });
    });
}

export { PRESETS, PRESETS_DUPLICATES, PRESETS_RANGE };
export { save, saveTeam, loadTeam, buildTeam, synergiesFromChampions };
export default teams;
