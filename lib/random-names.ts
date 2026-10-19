const ADJECTIVES = [
  "Amber", "Arctic", "Brave", "Bright", "Calm", "Clever", "Cosmic", "Crimson", "Daring", "Dusty",
  "Electric", "Fuzzy", "Gentle", "Golden", "Happy", "Hidden", "Jolly", "Lucky", "Lunar", "Mellow",
  "Misty", "Nimble", "Noble", "Quiet", "Rapid", "Rustic", "Silent", "Silver", "Solar", "Sunny",
  "Swift", "Tidy", "Velvet", "Witty", "Zesty",
];

const NOUNS = [
  "Badger", "Beacon", "Comet", "Falcon", "Fox", "Gecko", "Harbor", "Koala", "Lantern", "Lynx",
  "Maple", "Meadow", "Nebula", "Otter", "Owl", "Panda", "Pebble", "Penguin", "Pixel", "Quokka",
  "Raven", "Rocket", "Sparrow", "Summit", "Tiger", "Walrus", "Willow", "Wombat", "Yak", "Zebra",
];

const CHANNEL_SUFFIXES = ["News", "Updates", "Digest", "Daily", "Bulletin", "Broadcast"];
const GROUP_SUFFIXES = ["Club", "Crew", "Lounge", "Hub", "Circle", "Squad"];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * A display name plus a matching username that satisfies validateBotUsername
 * (letter first, <= 32 chars, ends in "bot"). The 4-digit suffix makes a
 * collision with an existing bot unlikely, but BotFather still has the final say.
 */
export function randomBotIdentity(): { name: string; username: string } {
  const adjective = pick(ADJECTIVES);
  const noun = pick(NOUNS);
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return { name: `${adjective} ${noun}`, username: `${adjective}${noun}${digits}_bot` };
}

export function randomChatTitle(kind: "channel" | "supergroup"): string {
  return `${pick(ADJECTIVES)} ${pick(NOUNS)} ${pick(kind === "channel" ? CHANNEL_SUFFIXES : GROUP_SUFFIXES)}`;
}
