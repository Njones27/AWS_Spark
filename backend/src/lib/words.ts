// Builder Key words (docs/aws/CONTRACT.md, Identity): 1,000 friendly words a student may see alone or in any pair.
// Picked by hand to survive being quoted out of context (tasks/lessons.md): no double-meaning food or body words, no
// slang, nothing scary, violent, rude, medical or religious, and no brand-first words. No black, white, brown, yellow,
// red or primates, so no colour and animal pair can read as a slur, and no two words that pair into a rude phrase.
// Mostly words a young student can spell. Editing the list changes which keys are issued, never which keys work:
// recovery looks a key up by its hash. test/words.test.ts checks count, uniqueness, length, charset and a blocklist.
export const WORDS: readonly string[] = [
  // Animals: mammals
  'ALPACA', 'BADGER', 'BEAR', 'BISON', 'BOBCAT', 'BUFFALO', 'CARIBOU', 'CHEETAH', 'DEER', 'DINGO', 'DOLPHIN', 'ELK',
  'FAWN', 'FERRET', 'FOAL', 'FOX', 'GAZELLE', 'GIRAFFE', 'GOAT', 'GOPHER', 'HAMSTER', 'HARE', 'HIPPO', 'HORSE',
  'JAGUAR', 'KOALA', 'LAMB', 'LEOPARD', 'LION', 'LIONESS', 'LLAMA', 'LYNX', 'MEERKAT', 'MINK', 'MOOSE', 'MOUSE',
  'NARWHAL', 'ORCA', 'OTTER', 'PANDA', 'PANTHER', 'PONY', 'POSSUM', 'RABBIT', 'RHINO', 'SEAL', 'SHEEP', 'TIGER',
  'WALLABY', 'WALRUS', 'WHALE', 'WOMBAT', 'YAK', 'ZEBRA', 'CALF', 'CUB', 'JOEY', 'BELUGA', 'MANATEE', 'PUPPY',
  'KITTEN', 'PUP', 'DOE', 'CAT', 'DOG',
  // Animals: pets and dogs
  'BEAGLE', 'COLLIE', 'CORGI', 'PUG', 'HUSKY', 'TERRIER', 'BULLDOG', 'TABBY', 'CALICO',
  // Animals: birds
  'ROBIN', 'WREN', 'FINCH', 'SPARROW', 'LARK', 'OWL', 'EAGLE', 'FALCON', 'HERON', 'CRANE', 'STORK', 'PELICAN',
  'PENGUIN', 'PUFFIN', 'GULL', 'SEAGULL', 'KIWI', 'EMU', 'OSTRICH', 'PARROT', 'MACAW', 'CANARY', 'BUDGIE', 'TOUCAN',
  'DOVE', 'PIGEON', 'MAGPIE', 'JAY', 'BLUEJAY', 'QUAIL', 'DUCK', 'SWAN', 'MALLARD', 'SKYLARK',
  // Animals: water
  'SALMON', 'TROUT', 'TUNA', 'PERCH', 'PIKE', 'CARP', 'GUPPY', 'MINNOW', 'HERRING', 'SARDINE', 'EEL', 'OCTOPUS',
  'SCALLOP', 'LOBSTER', 'KRILL', 'KOI',
  // Animals: small creatures
  'BEE', 'ANT', 'BEETLE', 'LADYBUG', 'MOTH', 'CRICKET', 'FIREFLY', 'SNAIL', 'BEEHIVE',
  // Animals: reptiles and amphibians
  'FROG', 'NEWT', 'GECKO', 'IGUANA', 'LIZARD', 'TURTLE', 'TADPOLE',
  // Trees
  'OAK', 'MAPLE', 'PINE', 'BIRCH', 'ASPEN', 'CEDAR', 'ELM', 'WILLOW', 'BEECH', 'FIR', 'HAZEL', 'HOLLY', 'JUNIPER',
  'REDWOOD', 'SPRUCE', 'BAMBOO', 'PALM', 'TREE', 'SHRUB',
  // Flowers and plants
  'ROSE', 'DAISY', 'TULIP', 'LILY', 'IRIS', 'ORCHID', 'VIOLET', 'LILAC', 'JASMINE', 'HEATHER', 'CLOVER', 'THISTLE',
  'FERN', 'MOSS', 'IVY', 'PETUNIA', 'BLOSSOM', 'PETAL', 'BLOOM', 'SPROUT', 'ACORN', 'TWIG', 'BRANCH', 'LEAF', 'VINE',
  'REED', 'NETTLE', 'CACTUS', 'ALOE', 'GARDEN', 'MEADOW', 'WHEAT', 'BARLEY', 'MAIZE', 'HAY', 'STRAW', 'GRAIN',
  'CROCUS',
  // Herbs and spices
  'SAGE', 'BASIL', 'MINT', 'PARSLEY', 'DILL', 'PEPPER', 'VANILLA', 'SALT',
  // Colours
  'BLUE', 'GREEN', 'ORANGE', 'PURPLE', 'PINK', 'INDIGO', 'TEAL', 'CYAN', 'AQUA', 'AMBER', 'IVORY', 'SILVER', 'GOLD',
  'GOLDEN', 'BRONZE', 'COPPER', 'MAGENTA', 'SCARLET', 'CRIMSON', 'RUBY', 'JADE', 'EMERALD', 'TOPAZ', 'OPAL', 'PEARL',
  'NAVY', 'GREY', 'SLATE', 'LIME', 'LEMON', 'ROSY', 'BLUSH', 'APRICOT', 'RUST', 'CARAMEL',
  // Weather
  'SUNNY', 'SUN', 'SUNBEAM', 'SUNRISE', 'SUNSET', 'SUNLIT', 'CLOUD', 'CLOUDY', 'RAIN', 'RAINY', 'RAINBOW', 'DRIZZLE',
  'SNOW', 'SNOWY', 'SNOWMAN', 'FROST', 'FROSTY', 'ICICLE', 'BREEZE', 'BREEZY', 'GUST', 'GALE', 'MIST', 'MISTY', 'FOG',
  'FOGGY', 'DEW', 'DEWDROP', 'SLEET', 'FLURRY', 'MONSOON', 'THAW', 'PUDDLE', 'SEASON', 'SPRING', 'SUMMER', 'AUTUMN',
  'WINTER', 'WARM', 'COOL', 'CHILLY', 'CRISP',
  // Sky and space
  'AURORA', 'COMET', 'STAR', 'STARRY', 'MOON', 'MOONLIT', 'PLANET', 'ORBIT', 'GALAXY', 'METEOR', 'ROCKET', 'SATURN',
  'MARS', 'PLUTO', 'JUPITER', 'MERCURY', 'NEPTUNE', 'EARTH', 'LUNAR', 'SOLAR', 'ECLIPSE', 'CRATER', 'NOVA', 'DAWN',
  'DUSK', 'SKY', 'SKYLINE', 'HORIZON', 'SHUTTLE', 'SPACE', 'DAYTIME', 'MORNING', 'NOON', 'EVENING', 'POLAR', 'ARCTIC',
  // Land
  'RIVER', 'LAKE', 'POND', 'CREEK', 'BROOK', 'STREAM', 'OCEAN', 'SEA', 'BAY', 'COVE', 'LAGOON', 'REEF', 'ISLAND',
  'ISLE', 'BEACH', 'SHORE', 'COAST', 'DUNE', 'DESERT', 'OASIS', 'CANYON', 'VALLEY', 'PRAIRIE', 'FIELD', 'FOREST',
  'GROVE', 'MARSH', 'GLEN', 'HILL', 'HILLTOP', 'PEAK', 'SUMMIT', 'RIDGE', 'CLIFF', 'CAVE', 'CAVERN', 'GLACIER',
  'ICEBERG', 'TUNDRA', 'BOULDER', 'PEBBLE', 'STONE', 'ROCK', 'SAND', 'CLAY', 'MUD', 'SOIL', 'DUST', 'LAVA', 'VOLCANO',
  'GEYSER', 'DELTA', 'RAPIDS', 'HARBOR', 'ORCHARD', 'PASTURE', 'RANCH', 'PARK', 'TRAIL', 'PATH', 'HEDGE', 'CASCADE',
  'FALLS', 'SEASIDE', 'TREETOP',
  // Water and seaside
  'WAVE', 'TIDE', 'RIPPLE', 'SPLASH', 'SURF', 'FOAM', 'SPRAY', 'DRIFT', 'SHELL', 'CORAL', 'DOCK', 'PIER', 'MARINA',
  'PORT', 'WATER',
  // Rocks and gems
  'CRYSTAL', 'QUARTZ', 'GRANITE', 'MARBLE', 'FLINT', 'GEM', 'JEWEL', 'DIAMOND', 'FOSSIL', 'EMBER', 'SPARK',
  // Fruit
  'APPLE', 'AVOCADO', 'BERRY', 'FIG', 'MANGO', 'OLIVE', 'PAPAYA', 'PEAR', 'RAISIN', 'CITRUS',
  // Vegetables
  'CARROT', 'BEAN', 'CORN', 'POTATO', 'TOMATO', 'ONION', 'GARLIC', 'CELERY', 'LETTUCE', 'KALE', 'SPINACH', 'RADISH',
  'BEET', 'SQUASH', 'PUMPKIN', 'YAM', 'CHILI',
  // Food
  'BREAD', 'BAGEL', 'PANCAKE', 'SCONE', 'BISCUIT', 'COOKIE', 'PRETZEL', 'TOAST', 'BUTTER', 'CHEESE', 'YOGURT',
  'CUSTARD', 'JAM', 'SYRUP', 'PIE', 'CUPCAKE', 'TOFFEE', 'CANDY', 'TRUFFLE', 'SORBET', 'GELATO', 'SUNDAE', 'POPCORN',
  'PASTA', 'PIZZA', 'BURRITO', 'NACHO', 'SUSHI', 'RAMEN', 'OATMEAL', 'CEREAL', 'GRANOLA', 'SOUP', 'STEW', 'CURRY',
  'BROTH', 'SALAD', 'OMELET', 'BURGER', 'KETCHUP', 'MUSTARD', 'RELISH', 'SALSA', 'GRAVY', 'PESTO', 'HUMMUS', 'TOFU',
  'PASTRY', 'GUMDROP', 'ICING', 'MOCHI', 'PITA', 'MILK', 'JUICE', 'TEA', 'SODA', 'EGG', 'CHEDDAR', 'SESAME',
  'LASAGNA', 'RAVIOLI', 'GUMMY', 'CHIPS', 'FRIES', 'MAYO', 'SUGAR', 'LOAF', 'CRUMB', 'CRUST', 'DOUGH', 'BATTER',
  'FLOUR', 'YOLK',
  // Home
  'CHAIR', 'TABLE', 'SOFA', 'COUCH', 'LAMP', 'CANDLE', 'CLOCK', 'MIRROR', 'PILLOW', 'BLANKET', 'QUILT', 'CARPET',
  'RUG', 'CURTAIN', 'WINDOW', 'DOOR', 'KEY', 'LOCK', 'BASKET', 'BUCKET', 'BROOM', 'MOP', 'SPONGE', 'TOWEL', 'SOAP',
  'BUBBLE', 'BENCH', 'VASE', 'FRAME', 'SHELF', 'CABINET', 'CLOSET', 'HANGER', 'DRESSER', 'CRIB', 'LAUNDRY', 'IRON',
  'COMB', 'HOOK', 'PIN', 'CLIP', 'HANDLE', 'PADLOCK', 'KEYRING', 'HAMMOCK', 'CRADLE', 'STAIRS', 'HALLWAY', 'KITCHEN',
  'PANTRY', 'ATTIC', 'CELLAR', 'GARAGE', 'PORCH', 'PATIO', 'DECK', 'YARD', 'LAWN', 'WALL', 'FLOOR', 'ROOF', 'CHIMNEY',
  'BALCONY', 'GATE', 'FENCE', 'SHED',
  // Kitchen
  'TEAPOT', 'KETTLE', 'CUP', 'MUG', 'BOWL', 'PLATE', 'SPOON', 'LADLE', 'WHISK', 'SPATULA', 'TOASTER', 'OVEN', 'STOVE',
  'FRIDGE', 'JAR', 'BOTTLE', 'TRAY', 'APRON', 'TEACUP', 'PITCHER', 'BLENDER', 'FUNNEL', 'TIMER', 'MIXER', 'PAN',
  'WOK', 'LID', 'COASTER', 'PLATTER',
  // Clothes and sewing
  'BUTTON', 'ZIPPER', 'POCKET', 'THREAD', 'YARN', 'RIBBON', 'BOW', 'LACE', 'SCARF', 'MITTEN', 'GLOVE', 'HAT', 'CAP',
  'BOOT', 'SHOE', 'SANDAL', 'SLIPPER', 'SWEATER', 'JACKET', 'COAT', 'HOODIE', 'VEST', 'KILT', 'CLOAK', 'BONNET',
  'BERET', 'HELMET', 'PARASOL', 'SATCHEL', 'WALLET', 'LOCKET', 'CROWN', 'TIARA', 'SPOOL', 'PATCH', 'BEANIE', 'PONCHO',
  'TUXEDO', 'PAJAMAS', 'PARKA', 'BLAZER', 'DRESS', 'GOWN', 'ROBE', 'SHIRT', 'BLOUSE', 'TIE', 'BELT', 'BUCKLE',
  'SNEAKER', 'SHORTS', 'JERSEY', 'UNIFORM', 'COSTUME', 'MASK', 'CAPE', 'WIG', 'GOGGLES', 'SUNHAT', 'BANDANA', 'BEAD',
  'CHARM', 'WOOL', 'SILK', 'LINEN', 'DENIM', 'VELVET', 'FLEECE', 'CANVAS',
  // School and art
  'CRAYON', 'PENCIL', 'PEN', 'MARKER', 'ERASER', 'RULER', 'PAPER', 'FOLDER', 'STAPLER', 'BINDER', 'GLUE', 'TAPE',
  'CHALK', 'EASEL', 'PAINT', 'BRUSH', 'SKETCH', 'GLOBE', 'MAP', 'ATLAS', 'MAGNET', 'LENS', 'PRISM', 'ABACUS',
  'NOTEPAD', 'JOURNAL', 'DIARY', 'POSTER', 'STICKER', 'LIBRARY', 'LOCKER', 'DESK', 'SCHOOL', 'LESSON', 'QUIZ',
  'RECESS', 'INK', 'SCROLL', 'BOOK', 'PAGE', 'CHAPTER', 'NOVEL', 'LETTER', 'NUMBER', 'GRAPH', 'CHART', 'SCIENCE',
  'PROJECT', 'PRIZE', 'AWARD', 'MEDAL', 'TROPHY', 'BADGE', 'BANNER', 'FLAG', 'STAMP', 'PARCEL', 'TICKET', 'MAILBOX',
  // Toys and games
  'KITE', 'YOYO', 'PUZZLE', 'DOMINO', 'TEDDY', 'DOLL', 'ROBOT', 'PUPPET', 'RATTLE', 'CHESS', 'ROOK', 'KNIGHT', 'DICE',
  'HOOP', 'JACKS', 'KAZOO', 'WHISTLE', 'SPINNER', 'POGO', 'BLOCKS', 'SANDBOX', 'SEESAW', 'SLIDE', 'BALLOON', 'TOYBOX',
  'GAME', 'CARDS', 'BINGO',
  // Music and stories
  'BELL', 'DRUM', 'FLUTE', 'HARP', 'PIANO', 'VIOLIN', 'CELLO', 'BANJO', 'GUITAR', 'UKULELE', 'TUBA', 'MELODY',
  'CHORUS', 'BALLAD', 'TUNE', 'SONG', 'HARMONY', 'JINGLE', 'ANTHEM', 'TEMPO', 'NOTE', 'POEM', 'STORY', 'FABLE',
  'RIDDLE', 'MOSAIC', 'MURAL', 'COMIC', 'CARTOON', 'CHIME', 'GONG', 'BAND', 'DUET', 'SOLO', 'STAGE',
  // Vehicles and travel
  'ANCHOR', 'PADDLE', 'CANOE', 'KAYAK', 'RAFT', 'YACHT', 'WAGON', 'SCOOTER', 'BICYCLE', 'SLED', 'SLEIGH', 'TRAIN',
  'TRAM', 'TROLLEY', 'TRUCK', 'TRACTOR', 'BUS', 'TAXI', 'VAN', 'CARAVAN', 'GLIDER', 'JET', 'PLANE', 'AIRSHIP',
  'TUGBOAT', 'CAR', 'BOAT', 'SHIP', 'BIKE', 'SKI', 'CART', 'BUGGY', 'TRAILER', 'CAMPER',
  // Tools, buildings and places
  'WRENCH', 'DRILL', 'LADDER', 'SHOVEL', 'TROWEL', 'LEVEL', 'BOLT', 'LEVER', 'GEAR', 'WHEEL', 'CHAIN', 'BARREL',
  'CRATE', 'BRIDGE', 'TOWER', 'CASTLE', 'PALACE', 'COTTAGE', 'CABIN', 'IGLOO', 'TENT', 'HUT', 'BARN', 'FARM', 'MILL',
  'STATUE', 'MUSEUM', 'MARKET', 'CAFE', 'DINER', 'STADIUM', 'THEATER', 'CIRCUS', 'PARADE', 'CONCERT', 'TOOLBOX',
  'TUNNEL', 'ARCH', 'DOME', 'HOUSE', 'HOME', 'CINEMA', 'ARENA', 'ZOO', 'SHOP', 'STORE', 'MALL', 'HOTEL', 'INN',
  'AIRPORT', 'STATION', 'VILLAGE', 'TOWN', 'CITY', 'STREET', 'AVENUE', 'ROAD', 'LANE', 'ALLEY', 'PLAZA', 'SILO',
  'STABLE', 'KENNEL', 'NEST', 'HIVE', 'GRAVEL', 'BRICK', 'TILE', 'PLANK', 'BEAM', 'TIMBER', 'LOG', 'PIPE', 'SINK',
  'TUB', 'BATHTUB', 'HOSE', 'FEEDER',
  // Science and tech
  'PIXEL', 'ATOM', 'LASER', 'CIRCUIT', 'BATTERY', 'SIGNAL', 'RADAR', 'SENSOR', 'GADGET', 'WIDGET', 'CODE', 'SERVER',
  'ROUTER', 'BEACON', 'LANTERN', 'TORCH', 'LIGHT', 'GLOW', 'SHINE', 'GLEAM', 'TWINKLE', 'SPARKLE', 'GLITTER',
  'SHIMMER', 'DAZZLE', 'ECHO', 'MOTOR', 'ENGINE', 'ROVER', 'ANTENNA', 'CABLE', 'WIRE', 'SWITCH', 'BULB', 'DATA',
  'LAPTOP', 'TABLET', 'SCREEN', 'BROWSER', 'APP', 'EMOJI', 'DRONE', 'CAMERA', 'PHOTO', 'ALBUM', 'RADIO', 'SPEAKER',
  'HEADSET', 'REMOTE', 'PRINTER',
  // Shapes and patterns
  'CIRCLE', 'SQUARE', 'OVAL', 'HEART', 'CUBE', 'SPHERE', 'ARROW', 'SPIRAL', 'ZIGZAG', 'DOT', 'STRIPE', 'SPOT',
  'PLAID', 'POLKA', 'CONE', 'PYRAMID', 'LOOP', 'SWIRL', 'WIGGLE', 'PATTERN',
  // Sports and play
  'TENNIS', 'SOCCER', 'HOCKEY', 'RUGBY', 'GOLF', 'BOWLING', 'SKIING', 'SURFING', 'SAILING', 'ROWING', 'HIKING',
  'CAMPING', 'JOGGING', 'SPRINT', 'RELAY', 'SKATING', 'DIVING', 'JUGGLE', 'CYCLING', 'SWIM', 'RACING', 'DANCE',
  'BALLET',
];
