// Le club ne dispose que de deux terrains.
export const MATCH_COURTS = [1, 2];

// Un padel se joue à 4 : la capacité suit le nombre de terrains, puis reste
// ajustable à la main par l'organisateur.
export const PLAYERS_PER_COURT = 4;

export function matchCapacity(courts: number): number {
  return PLAYERS_PER_COURT * Math.max(1, courts);
}
