import { Card, SectionTitle } from "./ui";

const cellCls = "px-3 py-2";

// Règlement officiel — repris de la v1.
export function Reglement() {
  return (
    <div className="mx-auto max-w-xl space-y-5 pb-8">
      <div>
        <SectionTitle>🎾 Format général</SectionTitle>
        <Card className="p-4 text-sm leading-7 text-sub">
          <b className="text-body">8 joueurs</b> répartis en <b className="text-body">4 équipes de 2</b>{" "}
          (un joueur côté <b className="text-body">Gauche</b>, un côté <b className="text-body">Droite</b> —
          positions fixes pour toute la session).
          <br />
          <br />
          <b className="text-body">2 terrains</b> en simultané. Une session dure{" "}
          <b className="text-body">3 rounds</b> : à chaque round les 4 équipes jouent (2 matchs en
          parallèle), donc <b className="text-body">chaque joueur dispute 3 matchs</b> par session.
          <br />
          <br />
          Les associations équipe vs équipe évitent les répétitions d&apos;un round à l&apos;autre
          (priorité aux paires qui se sont le moins affrontées).
        </Card>
      </div>

      <div>
        <SectionTitle>⏱ Temps de jeu</SectionTitle>
        <Card className="p-4 text-sm leading-7 text-sub">
          <b className="text-body">Échauffement</b> : 6 minutes avant le 1ᵉʳ round (démarrage anticipé
          possible).
          <br />
          <b className="text-body">Durée d&apos;un match</b> : 27 minutes chrono — une cloche sonne à la
          fin du temps imparti.
          <br />
          <br />
          Le score (en jeux) se saisit librement pendant le match, sans limite fixe — on joue
          jusqu&apos;à la fin du temps. L&apos;organisateur valide ensuite les scores (un 0-0 ne peut pas
          être validé). Après validation, le round suivant démarre automatiquement, sans nouvel
          échauffement.
        </Card>
      </div>

      <div>
        <SectionTitle>🎲 Tirage du service</SectionTitle>
        <Card className="p-4 text-sm leading-7 text-sub">
          Au début de <b className="text-body">chaque match</b>, l&apos;équipe qui sert en premier est{" "}
          <b className="text-body">tirée au sort aléatoirement</b> (50/50) — affichée à l&apos;écran avant
          le lancement du round.
        </Card>
      </div>

      <div>
        <SectionTitle>📋 Déroulement d&apos;une session</SectionTitle>
        <Card className="p-4 text-sm leading-8 text-sub">
          1. Inscription des 8 participants (liste d&apos;attente si complet)
          <br />
          2. Composition des équipes (Gauche / Droite)
          <br />
          3. Échauffement (6 min) puis tirage du service
          <br />
          4. 3 rounds de matchs (27 min chacun), validation des scores après chaque round
          <br />
          5. Fin de session après le 3ᵉ round → résultats archivés
        </Card>
      </div>

      <div>
        <SectionTitle>🏆 Classement de la session</SectionTitle>
        <Card className="p-4 text-sm leading-7 text-sub">
          Les équipes sont classées par <b className="text-body">Victoires</b> (3 pts) +{" "}
          <b className="text-body">Nuls</b> (1 pt), puis par{" "}
          <b className="text-body">différence de jeux (+/-)</b>, puis par jeux marqués.
        </Card>
      </div>

      <div>
        <SectionTitle>🔀 Formule Mexicano</SectionTitle>
        <Card className="p-4 text-sm leading-7 text-sub">
          Toujours <b className="text-body">8 joueurs sur 2 terrains</b>, mais{" "}
          <b className="text-body">sans équipe fixe</b> : les paires sont recomposées à chaque round.
          5 matchs de <b className="text-body">15 minutes</b> (après 6 min d&apos;échauffement).
          <br />
          <br />
          <b className="text-body">Rounds 1 à 4 — classement.</b> Au round 1, les joueurs sont classés
          selon le classement V-Champs ; ensuite selon le{" "}
          <b className="text-body">classement du jour</b>. Les 4 premiers jouent sur le terrain 1, les
          4 suivants sur le terrain 2 : le 1ᵉʳ avec le 4ᵉ contre le 2ᵉ et le 3ᵉ (on ajuste si cela
          reforme une paire déjà associée).
          <br />
          <br />
          <b className="text-body">Round 5 — finales.</b> Les 4 premiers du classement jouent la{" "}
          <b className="text-body">🏆 finale</b> sur le terrain 1, les 4 autres la{" "}
          <b className="text-body">🥉 petite finale</b> sur le terrain 2.
          <br />
          <br />
          <b className="text-body">Classement final</b> : vainqueurs de la finale 1ᵉʳ et 2ᵉ, perdants 3ᵉ
          et 4ᵉ, vainqueurs de la petite finale 5ᵉ et 6ᵉ, perdants 7ᵉ et 8ᵉ. Au sein de chaque duo, et
          pendant les rounds de classement, on départage aux jeux gagnés, puis à la différence de
          jeux, puis aux victoires.
          <br />
          <br />
          Points V-Champs (niveau 6/7, multipliés par le coefficient du niveau) :{" "}
          <b className="text-body">100 · 88 · 76 · 64 · 52 · 42 · 32 · 25</b> du 1ᵉʳ au 8ᵉ,{" "}
          <b className="text-body">+20 bonus</b> pour les vainqueurs de la finale et{" "}
          <b className="text-body">+10 bonus</b> pour ceux de la petite finale (bonus partagé en cas de
          nul).
        </Card>
      </div>

      <div>
        <SectionTitle>🔄 Formule Best Of 4</SectionTitle>
        <Card className="p-4 text-sm leading-7 text-sub">
          <b className="text-body">4 joueurs sur 1 terrain</b>. Chaque joueur joue avec chacun des 3
          autres <b className="text-body">une fois à gauche et une fois à droite</b> :{" "}
          <b className="text-body">6 matchs de 13 minutes</b> (après 6 min d&apos;échauffement), soit 3
          matchs à gauche et 3 à droite pour tout le monde. Le programme est fixe et évite de
          rejouer deux fois de suite la même affiche ou de rester plus de deux matchs d&apos;affilée
          du même côté. Score en jeux, comme les autres formules.
          <br />
          <br />
          Classement de la session <b className="text-body">individuel</b> : jeux gagnés, puis
          différence de jeux, puis victoires.
          <br />
          <br />
          <b className="text-body">Classement à part</b> : le Best Of 4 ne rapporte pas de points
          V-Champs et ne compte pas dans les statistiques V-Champs. Il alimente son propre classement
          (onglet « Best Of 4 ») : <b className="text-body">10 · 6 · 3 · 1 pts</b> du 1ᵉʳ au 4ᵉ de
          chaque session, puis départage au nombre de victoires de session et au +/-.
        </Card>
      </div>

      <div>
        <SectionTitle>⭐ Points V-Champs — barème par niveau</SectionTitle>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-mut">
                <th className={cellCls}>Niveau</th>
                <th className={cellCls}>Coeff.</th>
                <th className={cellCls}>1er</th>
                <th className={cellCls}>2e</th>
                <th className={cellCls}>3e</th>
                <th className={cellCls}>4e</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["3/4", "×0.35", 35, 26, 18, 9, false],
                  ["4/5", "×0.5", 50, 38, 25, 13, false],
                  ["5/6", "×0.75", 75, 56, 38, 19, false],
                  ["6/7", "×1.0", 100, 75, 50, 25, true],
                  ["7/8", "×1.5", 150, 113, 75, 38, false],
                  ["8/9", "×2.0", 200, 150, 100, 50, false],
                  ["9/10", "×2.5", 250, 188, 125, 63, false],
                ] as const
              ).map(([lv, coeff, a, b, c, d, hl]) => (
                <tr
                  key={lv}
                  className={`border-b border-line/50 last:border-0 ${hl ? "font-bold text-gold" : "text-sub"}`}
                >
                  <td className={cellCls}>{lv}</td>
                  <td className={cellCls}>{coeff}</td>
                  <td className={cellCls}>{a}</td>
                  <td className={cellCls}>{b}</td>
                  <td className={cellCls}>{c}</td>
                  <td className={cellCls}>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div>
        <SectionTitle>⚖️ Ajustement selon la force des adversaires</SectionTitle>
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-mut">
                <th className={cellCls}>Écart de force</th>
                <th className={cellCls}>Coefficient</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["Équipe largement plus forte (≥ +300)", "×0.95"],
                  ["Plus forte (≥ +200)", "×0.97"],
                  ["Légèrement plus forte (≥ +100)", "×0.99"],
                  ["Équilibré (-99 à +99)", "×1.00"],
                  ["Légèrement outsider (≥ -199)", "×1.01"],
                  ["Outsider (≥ -299)", "×1.03"],
                  ["Largement outsider (< -299)", "×1.05"],
                ] as const
              ).map(([label, coeff]) => (
                <tr key={label} className="border-b border-line/50 text-sub last:border-0">
                  <td className={cellCls}>{label}</td>
                  <td className={`${cellCls} font-semibold text-body`}>{coeff}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="px-1 pt-2.5 text-xs leading-6 text-sub">
          💡 La « force » d&apos;un joueur ne compte qu&apos;à partir de sa{" "}
          <b className="text-body">3ᵉ session jouée</b> — avant cela, il est considéré neutre et ne
          déséquilibre pas le calcul.
        </p>
      </div>

      <div>
        <SectionTitle>📊 Classement général V-Champs</SectionTitle>
        <Card className="p-4 text-sm leading-7 text-sub">
          Seules les <b className="text-body">8 meilleures performances des 180 derniers jours</b> sont
          retenues pour chaque joueur — le score affiché est la somme de ces 8 meilleures
          performances.
          <br />
          <br />
          Un joueur devient <b className="text-body">actif</b> (classé) à partir de{" "}
          <b className="text-body">4 sessions valides</b> sur la période ; en dessous, il reste{" "}
          <b className="text-body">inactif</b>, classé après tous les actifs.
        </Card>
      </div>
    </div>
  );
}
