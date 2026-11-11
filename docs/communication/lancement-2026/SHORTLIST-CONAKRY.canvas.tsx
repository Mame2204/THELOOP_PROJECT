import {
  Callout,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Select,
  Stack,
  Stat,
  Table,
  Text,
  TextInput,
  useCanvasState,
} from "cursor/canvas";

type Verdict = "A" | "B" | "C" | "Hors";
type Spot = {
  src: string;
  name: string;
  quartier: string;
  cat: string;
  verdict: Verdict;
  loop: string;
  pourquoi: string;
  risque: string;
};

const DATA = `Le Jacquier||Kipé, Ratoma|Fine dining|A|Oui — ouverture|Cheffe Yaya Barry. Cuisine guinéenne revisité, architecture Fouta, table unique à Conakry.|Petite capacité ; confirmer horaires décembre.
L’Adresse (Noom)||Kaloum|Fine dining|A|Oui — ouverture|Afro-fusion face mer, brunch dimanche, dîners d’affaires.|Tarifs élevés.
Siete||Riviera Royal, Tombo|Fine dining|A|Oui — ouverture|Pan-asiatique rooftop, vue Atlantique, un des rares sushis haut de gamme.|Souvent fermé le mardi ; passer par l’hôtel.
La Félicité||Kipé|Fine dining|A|Oui — ouverture|Table gastronomique, cocktails, brunch dimanche.|Moins d’avis récents que Jacquier / Patio.
Le Patio||Minière, Dixinn|Fine dining|A|Oui — ouverture|Institution chaleureuse, art guinéen, pâtisserie dès 6h30.|Patio chaud en journée ; l’intérieur est souvent préféré.
Le Damier||Kaloum, 8e avenue|Fine dining|A|Oui — ouverture|Institution pâtisserie / resto / traiteur. Brunch samedi, exigence produit.|Vérifier l’adresse exacte (Kaloum vs Kipé selon les listes).
Nomad||Kipé|Café / brunch|A|Oui — resto + coworking|Brunch le plus cité, cuisine locale + monde, salles de réunion.|Samedi / dimanche peuvent saturer.
Avenue||Résidence 2000, Moussoudougou|Fine dining|B|Oui sous réserve|Référence sushis / poisson, service loué. Déjà dans l’univers Loop.|Avis mixtes sur la viande et la constance.
KAKI||Kakimbo, Koloma|Fine dining|B|Oui — resto + live|Brasserie cosmopolite, brunch, live vendredi sur réservation.|Le live peut casser le calme.
L’Aquarium||Tombo, corniche sud|Fine dining|B|Oui sous réserve|Vue plage, déco méditerranéenne, live week-end.|Visiter un soir avec et sans musique.
Mille Pattes||Sandervalia, corniche ouest|Fine dining|B|Oui sous réserve|Terrasse océan, grillades, mix Guinéens / expats.|Service parfois long ; rush week-end.
L’Étoile / Petit Bateau||Corniche|Fine dining|B|Oui sous réserve|Cadre sunset, déjà dans la démo app.|Cuisine moins constante que le décor.
Italia Box||Camayenne|Fine dining|B|Oui en B|Pizza feu de bois, famille, classements voyageurs.|Utile, pas rare.
Le Hanoï||Coléah|Fine dining|B|Oui en B|Vietnamien rare à Conakry.|Peu d’avis ; juger accueil et constance.
Le Cèdre||Almamya, Kaloum|Fine dining|B|Oui en B|Rue discrète, déjeuner affaires.|À goûter ; pas une destination du week-end.
Restaurant Versailles||Conakry|Fine dining|C|Pas avant visite|Notes Google hautes.|Presque aucun récit éditorial.
The Indian Chowk||Conakry|Fine dining|C|Pas avant visite|Notes très hautes, volume faible.|Carte trop large (indien / chinois / guinéen).
Les Jardins de Guinée||Coléah / Matam|Fine dining|C|Pas à l’ouverture|Vieux repaire expats.|Notes ~3,5 ; nostalgie ≠ qualité 2026.
La Paillotte||Corniche|Fine dining|C|Non ouverture|Cadre océan.|Service souvent déçu — règle 2 fragile.
Yopougon||Kipé|Fine dining|C|Plus tard éventuellement|Maquis ivoirien, attiéké.|Bousculade / standing.
Mim’s Burger||Camayenne|Fine dining|Hors|Non|Bon burger.|Pas une expérience rare.
Brasserie U||Coléah|Fine dining|Hors|Non|Cantine au-dessus du U Express.|Pratique, pas sélectif.
Noom Hotel||Kaloum|Hôtel|A|Oui — hôtel + resto + bar|Piscine océan, L’Adresse, Pool Bar, avis 2026 encore très positifs.|Prix ; parfois le bruit.
Radisson Blu (ex-Sheraton)||Kipé|Hôtel|A|Oui — ne pas écrire Sheraton|Réouverture déc. 2024, vue mer, spa, gym 24h.|Vérifier que la rénovation a tenu.
Riviera Royal||Tombo, Kaloum|Hôtel|A|Oui — complexe|Siete, Baron, spa, tennis / padel.|Ne pas vendre le club 6h du matin comme The Loop.
Palm Camayenne||Camayenne|Hôtel|B|Oui sous réserve|Institution, terrasse jardin-océan.|Avis 2026 clivés sur les chambres / entretien.
ONOMO||Conakry|Hôtel|B|Pas à l’ouverture|Business 3*, accueil loué.|Redondant vs Noom / Radisson / Riviera.
Hôtel Kaloum||Almamya|Hôtel|C|Seulement si un espace sort du lot|Centre-ville, spa.|Correct, pas mémorable (~7,8 Booking).
Maï Hôtel||Coléah / Mafanco|Hôtel|B|Ficher le rooftop d’abord|Intérêt = H2 Lounge.|Chambres à confirmer.
Lounge 27||27e Kakimbo Est, Koloma|Bar / rooftop|A|Oui — ouverture|Vue 360° unique Kaloum → Kipé.|Vendredi soir à juger ; photos réelles obligatoires.
La Terrasse Palm Camayenne||Camayenne|Bar / rooftop|A|Oui même si l’hôtel est en B|Piscine, jardin, Atlantique. On peut parler.|Lié à l’entretien de l’hôtel.
Pool Bar Noom||Kaloum|Bar / rooftop|A|Oui|Piscine-océan, parfois jazz, afterwork chic.|Clientèle hôtel / prix.
Pool Bar Radisson Blu||Kipé|Bar / rooftop|A|Oui|Coucher de soleil, corniche nord.|À confirmer post-réouverture.
La Croisière||Dixinn, corniche|Bar / rooftop|B|Oui sous réserve|Rooftop paquebot, océan, jusqu’à 2h week-end.|Samedi : foule qui se pousse ? à voir sur place.
Rooftop H2 Lounge||Maï Hôtel, corniche sud|Bar / rooftop|B|Oui en B|Intime, vagues, DJ week-end.|DJ : soirée vs chaos.
Ocean’s Lounge||Rogbané, Taouyah|Bar / rooftop|B|Avis local d’abord|Terrasse plage, ancien Bénars, jeu–sam.|Standing 2026 à confirmer.
L’Atlantic Souzini||Boulbinet, phare|Bar / rooftop|B|Oui si ouvert|Pilotis, sunset sur le phare. Rare.|Sécurité / accueil à voir le soir.
Chez JMJ et Maguy||Kipé Dadia|Bar / rooftop|B|Plutôt culture|Bar-café culturel bien noté.|Pas un rooftop ; format à clarifier.
Le Baron (afterwork jeudi)||Riviera Royal|Événement|B|Afterwork oui, club non|Jeudi 18h–23h plus Loop que ven–sam 6h.|Club week-end = à juger (querelle ?) pas interdit par défaut.
Le Baron (club)||Riviera Royal|Boîte / lounge nuit|C|Agenda possible|Ven–sam 23h–6h, tenue. Peut être select si le public se tient.|Pas priorité 24/12 vs afterwork jeudi.
Geneva Night Club||Kipé|Boîte / lounge nuit|Hors|Non pour l’instant|Retours « générique / trop VIP » — pas seulement parce que boîte.|À rejuger si standing monte.
Petit Pihé Plus (PP+)||Concasseur Marché|Boîte / lounge nuit|Hors|Non|Night-club VIP / chicha.|Rien à voir avec le guide sélectif.
Bacio Nero||Kipé + Kaloum|Café / brunch|A|Oui|Espresso, gaufres, gelato. Enseigne soignée, 2 adresses.|Vérifier les deux sites.
Babina||Kaloum, immeuble Yansané|Café / brunch|B|Oui sous réserve|Brunch Instagram du centre.|Le goût doit suivre la photo.
Heroes Coffee||Almamya, Kaloum|Café / brunch|B|Oui en quotidien|Cantine des actifs dès 7h.|Utile, pas magique.
Brasserie des Arts (CCFG)||Kaloum|Café / brunch|A|Oui|Café dans la cour culturelle : calme rare au centre.|Horaires liés au centre.
Originel Spa||Conakry|Beauté|A|Oui|Soins peaux noires : vraie plus-value, pas un spa d’hôtel de plus.|Confirmer adresse / accueil.
Zen Garden Spa & Beauty||Camayenne, Dixinn|Beauté|A|Oui|Hammam, sauna, coiffure, massages. Près Cour suprême.|Qualité des soins à tester.
Spa Radisson Blu||Kipé|Beauté|A|Oui (hôtel ou fiche spa)|Hammam, jacuzzi, mer.|Ouvert aux non-résidents ?
Spa Riviera||Kaloum|Beauté|B|Oui si accès extérieur|Hammam, sauna, gym, tennis / padel.|Offre résidents vs public.
Mina Spa||Kipé & Lambanyi|Beauté|B|Oui sous réserve|Deux adresses, offre large.|Qualité à tester.
Heavenly Spa||Kipé|Beauté|B|Avis + visite|Ambiance feutrée revendiquée.|Peu de preuves hors réseaux.
Métamorphose Institut||Dixinn Port|Beauté|C|Si l’accueil est exceptionnel|Ongles, cils, microblading.|Utile, moins rare.
CCFG||Pont 8 Novembre, Kaloum|Culture|A|Oui — agenda n°1|Salle 300, expos, ciné, café-concert mercredi.|Demander le calendrier décembre.
Villa des Arts||Kipé|Culture|A|Oui|Galerie contemporaine depuis 2021.|Horaires / visites à clarifier.
Studios Kirah||Conakry|Culture|B|Oui|Pôle jeunes créateurs.|Sérieux, visites, horaires.
Musée national Sandervalia||Kaloum|Culture|C|Pas avant réouverture réelle|Collections nationales.|Encore en rénovation début 2026.
Kassa Kounki||Île de Kassa|Île|A|Oui — expérience week-end|Écolodge plage, resto poisson, oct.–juin.|Pirogue Boulbinet ; cash ; saison.
Kiriboungni Chez Sylfatou||Île de Roume|Île|A|Oui|Chambres + resto mer, cadre vert. Petit Futé 2026 positif.|Confort simple, pas un 5*.
Hôtel Sogué||Île de Roume|Île|A|Oui|Bungalows pilotis, plage, paillote.|Tarif plus élevé.
Waraba Hotel||Île de Roume|Île|C|Avis local|Chambres climatisé + resto.|Night-club sur l’île = règle 1.
Prima Center||Kipé / Kaporo Rails|Mode|Hors|Pas comme spot|Mall, foule, restos.|Événements ponctuels seulement, en agenda.
L’Adresse boutique||Immeuble Cissé, Kaloum|Mode|C|Visite|Prêt-à-porter, accueil cité.|Homonyme du resto Noom.
MSB Creation||Almamya, près Le Cèdre|Mode|C|Si le savoir-faire sort du lot|Atelier couture.|Un atelier de plus parmi beaucoup.
KAKI live vendredi||Kakimbo|Événement|B|Oui si le cadre tient|Dîner + musique, réservation.|Volume.
Noom afterwork / jazz pool||Kaloum|Événement|A|Oui|Format soigné, couple / pro.|Dates à caler avec l’hôtel.
Brunchs Nomad / Félicité / Noom||Kipé & Kaloum|Événement|A|Oui — agenda dimanche|Rendez-vous récurrents, public Loop.|Réserver la veille.
Luxiole||Nongo|Événement|B|Partenaire prod., pas un lieu|Événementiel corporate.|Seulement s’ils programment du public soigné.
By Issa||Camayenne|Événement|Hors|Hors guide|Chapiteaux, traiteur, technique.|Prestataire B2B, pas une adresse.
72 Heures du Livre||Conakry|Événement|B|Agenda quand dates connues|Rendez-vous culturel national.|Pas un partenaire spot.
Nomad coworking||Kipé|Outil|A|Oui — Productivité|Même lieu que le brunch, salles de réunion.|Ne pas doubler deux fiches trop proches.
OFICI||Kipé Dadia|Outil|B|Oui si le cadre est agréable|Open space, coffee, journée 50k GNF.|Visiter avant de recommander.
TOogueda Village||Lambanyi, Ratoma|Outil|B|Oui sous réserve|Coworking 3 niveaux depuis 2018.|Cadre réel vs discours « village ».
Yango / apps taxi||Ville|Outil|C|Plus tard|Utile au quotidien.|Pas sélectif.
Loura Restaurant|F|Plage Camayenne|Fine dining|B|Oui — priorité formulaire|Marocain, sunset, avis 2025–26.|Rush week-end plage.
UMIÏ|F|Coléah|Bar / rooftop|B|Oui — priorité formulaire|Resto-bar, carte soignée.|Lounge tard à juger.
Millenium Suites|F|Landréah|Hôtel|B|À visiter|The West, Martini Lounge.|Doublon avec shortlist web.
Mariador Park|F|Taouyah|Hôtel|B|À visiter|Rénové 2024.|Comme ONOMO : redondant ?
Code Barre|F|Conakry|Boîte / lounge nuit|C|Nuit sélective — visite|Resto + lounge + piste : mood danse, pas chaos stade. Pas exclu parce que boîte.|Hype RS ; samedi tard vs jeudi posé.
Le Milliardaire|F|Conakry|Boîte / lounge nuit|C|Après cercle + visite|Lounge 24h : peut être posé hors pics.|Peu d’avis publics ; imprévisible.
911 Lounge|F|Kipé|Boîte / lounge nuit|C|Sous réserve|Festif Kipé, formulaire.|Pic samedi.
Imperium Lounge|F|Conakry|Boîte / lounge nuit|C|Sous réserve|Profil by night.|Standing à confirmer.
Upstairs Lounge|F|Résidence 2000|Boîte / lounge nuit|C|Après lancement|17h–4h, chicha.|Volume très tard.
Concert stade / balle poussière (type)|—|Ville|Événement massif|Hors|Agenda seulement si cadre tenu|Règle 1 Marianne : foule qui se pousse, querelles — pas « musique forte ».|Ne pas promouvoir sans sécurité.
Cherry Resto Café|F|Camayenne / Nongo|Café / brunch|B|Oui en B|Petit-déj, café.|Bruit au rush.
Salma's Diner|F|Résidence 2000|Fine dining|B|Avec Avenue|Libanais, groupe Avenue.|Visite avec Avenue.
Eldorado Steak House|F|Prima Center|Fine dining|B|Sous réserve|Steak ~50 couverts.|Foule centre commercial.
MAF Village|F|Maférinya|Île|B|Escapade|Écolodge hors Conakry.|Logistique.
Atlantic View|F|Ratoma|Hôtel|C|Après visite|Hôtel formulaire.|Peu d’info.
Setifana|F|Ratoma|Hôtel|C|Avis local|Hôtel.|Peu d’avis.
Minghao Club|F|Corniche nord|Fine dining|C|Sous réserve|Chinois, vue mer.|Karaoké = volume.
Amore Mio|F|Nongo|Café / brunch|B|Plus tard|Glacier.|1 fiche sucrée max.
SLM|F|Lambanyi|Fine dining|B|Si standing OK|Resto-pâtisserie nord.|À visiter.
RFC|F|Ville|Fine dining|Hors|Non|Fast food chaîne.|Pas select.
Coco Tea|F|Conakry|Café / brunch|Hors|Non|Marque non autorisée (alerte 2025).|Juridique.
Le Pavillon|F|Kobayah|Événement|Hors|Agenda si soigné|Concerts / rap.|Sécurité événement.
Heroes — Privilege|F|Conakry|Café / brunch|C|Si ≠ Heroes|Format premium Heroes ?|À clarifier.
Orange Money||Ville|Outil|Hors|Non|Infra nationale.|Pas une recommandation éditoriale.`;

function parseSpots(): Spot[] {
  return DATA.trim().split("\n").map((line) => {
    const [name, src, quartier, cat, verdict, loop, pourquoi, risque] = line.split("|");
    return {
      name,
      src,
      quartier,
      cat,
      verdict: verdict as Verdict,
      loop,
      pourquoi,
      risque,
    };
  });
}

const SPOTS = parseSpots();

const VAGUE1 = [
  "Le Jacquier","Le Patio","Le Damier","Nomad","Noom Hotel","Riviera Royal",
  "Radisson Blu (ex-Sheraton)","La Félicité","Lounge 27","CCFG","Bacio Nero",
  "Originel Spa","Zen Garden Spa & Beauty","Kassa Kounki","Avenue",
];

function toneFor(v: Verdict): "success" | "info" | "warning" | "danger" {
  if (v === "A") return "success";
  if (v === "B") return "info";
  if (v === "C") return "warning";
  return "danger";
}

function labelFor(v: Verdict): string {
  if (v === "A") return "A — Prioritaire";
  if (v === "B") return "B — Prometteur";
  if (v === "C") return "C — À valider";
  return "Hors lancement";
}

export default function ShortlistConakry() {
  const [q, setQ] = useCanvasState("q", "");
  const [verdict, setVerdict] = useCanvasState("verdict", "all");
  const [cat, setCat] = useCanvasState("cat", "all");

  const counts = {
    total: SPOTS.length,
    A: SPOTS.filter((s) => s.verdict === "A").length,
    B: SPOTS.filter((s) => s.verdict === "B").length,
    C: SPOTS.filter((s) => s.verdict === "C").length,
    Hors: SPOTS.filter((s) => s.verdict === "Hors").length,
  };

  const cats = Array.from(new Set(SPOTS.map((s) => s.cat))).sort();

  const filtered = SPOTS.filter((s) => {
    if (verdict !== "all" && s.verdict !== verdict) return false;
    if (cat !== "all" && s.cat !== cat) return false;
    const hay = `${s.name} ${s.quartier} ${s.pourquoi} ${s.loop}`.toLowerCase();
    if (q.trim() && !hay.includes(q.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <Stack gap={20}>
      <Stack gap={8}>
        <H1>Shortlist The Loop — Conakry</H1>
        <Text tone="secondary">
          98 lieux — fusion web + formulaire · 11 nov. 2026.
        </Text>
      </Stack>

      <Callout tone="info" title="Règle 1 — pas la bousculade (version Marianne)">
        Stade / balle poussière, querelles, hype RS sans fond — pas « interdit boîte ».
        Filtre Boîte / lounge nuit pour Code Barre, Milliardaire, etc.
      </Callout>

      <Grid columns={5} gap={12}>
        <Stat value={String(counts.total)} label="Lieux" />
        <Stat value={String(counts.A)} label="A" tone="success" />
        <Stat value={String(counts.B)} label="B" tone="info" />
        <Stat value={String(counts.C)} label="C" tone="warning" />
        <Stat value={String(counts.Hors)} label="Hors" tone="danger" />
      </Grid>

      <Row gap={8} wrap>
        {VAGUE1.map((name) => (
          <Pill key={name} tone="success" size="sm">{name}</Pill>
        ))}
      </Row>

      <Divider />

      <Row gap={12} wrap>
        <TextInput value={q} onChange={setQ} placeholder="Rechercher…" style={{ minWidth: 220 }} />
        <Select value={verdict} onChange={setVerdict} options={[
          { value: "all", label: "Tous avis" },
          { value: "A", label: "A" },{ value: "B", label: "B" },{ value: "C", label: "C" },{ value: "Hors", label: "Hors" },
        ]} />
        <Select value={cat} onChange={setCat} options={[
          { value: "all", label: "Toutes catégories" },
          ...cats.map((c) => ({ value: c, label: c })),
        ]} />
      </Row>

      <Table
        stickyHeader striped
        headers={["Lieu","Src","Quartier","Catégorie","Avis","The Loop ?","Pourquoi / risque"]}
        columnAlign={["left","left","left","left","left","left","left"]}
        rowTone={filtered.map((s) => toneFor(s.verdict))}
        rows={filtered.map((s) => [
          s.name, s.src || "S", s.quartier, s.cat, labelFor(s.verdict), s.loop,
          `${s.pourquoi} Risque : ${s.risque}`,
        ])}
        style={{ maxHeight: 560 }}
        emptyMessage="Aucun résultat."
      />
    </Stack>
  );
}
