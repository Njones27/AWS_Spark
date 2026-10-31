import { describe, expect, it } from 'vitest';
import { WORDS } from '../src/lib/words';

// Words or fragments that must never appear in a Builder Key. Exact words cover double meanings, insults, slurs,
// drugs and brands that were considered and left out on purpose; fragments catch rude words hiding inside others.
const BANNED_WORDS = `
  ASS BALL BALLS BANANA BEAVER BITCH BLACK BLOW BONE BOOB BOOBY BROWN BUN BUNS BUNNY BUTT CAKE CAMEL CHERRY CHICK
  CHIMP COCK COCOA COON COTTON COUGAR COW CRACK CRACKER CRAB CREAM CROW CUM DICK DIRT DONKEY FAG FAIRY FANNY FLAKE
  FRUIT FUDGE GAY GINGER GOOSE GORILLA GRAPE GRASS HAWK HELL HOE HONEY HORNY HOT ICE JUG JUGS KNOB MELON MELONS MOLLY
  MONKEY MOIST MUFF NUT NUTS PANSY PEA PEACH PEAS PECKER PEE PEG PICKLE PIG PIMP PLUM PLUG POLE POO POOP POT PRAWN
  PUSSY RACCOON RED RICE ROD ROOT ROPE SAUSAGE SCREW SEX SHAG SHOWER SKUNK SLOPE SNATCH SOCK SPADE SPANK SPICE STIFF
  SUCK TACO TART TIT TOOL TRUMP TURKEY URANUS WAFFLE WEED WEINER WET WHITE WIENER WILLY WOOD YELLOW
  AMAZON FRISBEE JEEP LEGO OREO PUMA SPRITE SUBWAY TESLA
  ANGEL CHURCH DEVIL DEMON GHOST GOD HEAVEN JESUS SATAN SKULL ZOMBIE BLOOD GUN KNIFE BOMB KILL DEAD
`.split(/\s+/).filter(Boolean);
const BANNED_FRAGMENTS = ['ASS', 'SEX', 'CUM', 'COCK', 'DICK', 'FUC', 'FUK', 'SHIT', 'PISS', 'CUNT', 'TWAT', 'SLUT',
  'WHORE', 'RAPE', 'NAZI', 'FAG', 'NIGG', 'PORN', 'NUDE', 'BOOB', 'ANAL', 'ANUS', 'PENIS', 'TIT', 'KILL', 'DEAD', 'BOMB',
  'GUN', 'COON', 'DAMN', 'CRAP', 'POOP', 'JIZZ', 'HOMO', 'WANK', 'PUSS', 'DEVIL', 'DEMON', 'SATAN', 'BLOOD'];

describe('Builder Key words', () => {
  it('has exactly 1,000 words', () => {
    expect(WORDS).toHaveLength(1000);
  });

  it('has no repeats', () => {
    expect(new Set(WORDS).size).toBe(WORDS.length);
  });

  it('uses only uppercase A–Z, 3 to 7 letters', () => {
    expect(WORDS.filter((w) => !/^[A-Z]{3,7}$/.test(w))).toEqual([]);
  });

  it('leaves out every banned word', () => {
    expect(WORDS.filter((w) => BANNED_WORDS.includes(w))).toEqual([]);
  });

  it('hides no rude fragment inside a word', () => {
    expect(WORDS.filter((w) => BANNED_FRAGMENTS.some((f) => w.includes(f)))).toEqual([]);
  });

  it('cannot pair into the rude phrases that were checked for', () => {
    const has = (w: string) => WORDS.includes(w);
    const pairs = [['GOLDEN', 'SHOWER'], ['BLUE', 'WAFFLE'], ['PINK', 'SOCK'], ['RICE', 'ROCKET'], ['TEA', 'BAG']];
    expect(pairs.filter(([a, b]) => has(a) && has(b))).toEqual([]);
  });
});
