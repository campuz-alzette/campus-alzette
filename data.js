/* Données du site et du programme — repère local en mètres, x vers l'est, y vers le nord.
   Origine : point LUREF (77 330 ; 81 900). Contour, crue et existant relevés sur des extraits géoréférencés du Géoportail. */
window.TC = (function () {
  var poly = [[112.6, 436.1], [272.6, 380.5], [224.6, 268.5], [213.0, 242.5], [217.9, 189.7], [118.9, 8.7], [6.9, 28.4]];
  function area(p) { var s = 0; for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }
  // Crue : grille de 10 m lue sur les cartes 2021. T : atteint dès la crue décennale ; C : HQ100, 0,5 à 1,0 m ; c : HQ100, 0 à 0,5 m ; . : hors crue centennale
  var floodRows = ["", "", "           TTTT", "           TTTTTTT", "           TTTTTTTTTT", "           CTTTTTTTTTTTT", "          CCCCTTTTTTTTTTTCC", "          CCCCCCTTTTTTTTTTC", "          CCCCCCCCCTTTTTTTT", "          CCCCCCCCCCCTTTTTT", "         CCCCCCCCCCCCCCTTT", "         CCCCCCCCCCCCCCCCC", "         CCCCCCCCCCCCCCCC", "         CCCCCCCCCCCCCCCC", "        ccccCCCCCCCCCCCCC", "        cccccCCCCCCCCCCC", "        cccccccCCCCCCCC.", "        ccCcccccCCCCCCC", "       cccccccccccccCCc", "       ccccccccccccccC", "       ccccccccccccccc", "       cccccccccccccCC", "      cccccccccccccccc", "      cccccccccccccccc", "      cccccccccccccccc", "     ccccccccccccccccc", "     ccccccccccccccccc", "     cccccccccccccccc", "     cccccccccccccccc", "    cccccccccccccccc", "    cccccccccccccccc", "    ccccccccccccccc", "    cccccccccccccc.", "   ccccccccccccccc", "   cccccccccccccc.", "   ccccccccccccc.", "   ccccccccccccc.", "  ccccccccccccc.", "  cccccccccc...", "  cccccccc.....", "  cccc........", " cccc.........", "   c.........", "         ...."];
  var cells = [];
  floodRows.forEach(function (row, j) { for (var i = 0; i < row.length; i++) if (row[i] !== " ") cells.push({ x: i * 10, y: 445 - j * 10, k: row[i] }); });
  var CW = 18.3, CL = 36.6; // emprise d'un court avec ses dégagements
  function row(x0, y0, n, name) { var a = []; for (var i = 0; i < n; i++) a.push({ x: x0 + i * CW, y: y0, w: CW, d: CL, surf: "clay", name: name }); return a; }
  var courts = [].concat(row(104, 304, 6, "Courts nord"), row(80, 124, 5, "Courts sud"));
  var centre = { x: 112.85, y: 174.7, w: CW, d: CL, surf: "hard", stands: [{ x: 101.5, y: 178, w: 10, d: 30 }, { x: 132.5, y: 178, w: 10, d: 30 }], seats: 500 };
  var b = {
    hall: { x: 84, y: 222, w: 74, d: 38, eave: 9, rise: 3.5 },
    padel: { x: 158, y: 176, w: 46, d: 24, eave: 8, rise: 2 },
    club: { x: 100, y: 268, w: 44, d: 20, h: 7.6 }
  };
  var parking = { x: 172, y: 208, w: 38, d: 74, rows: 4, perRow: 29 };
  var foot = { hall: b.hall.w * b.hall.d, padel: b.padel.w * b.padel.d, club: b.club.w * b.club.d };
  foot.total = foot.hall + foot.padel + foot.club;
  return {
    poly: poly, area: area(poly), cells: cells,
    // parts mesurées au pixel sur les cartes des zones inondables, à l'intérieur du contour
    flood: { dry: 0.075, low: 0.575, deep: 0.351, hq10: 0.113 },
    courts: courts, centre: centre, b: b, parking: parking, plinth: 0.9, foot: foot,
    gfa: { hall: foot.hall, padel: foot.padel, club: foot.club * 2 }, places: parking.rows * parking.perRow,
    // existant
    play: { x: 62, y: 20, w: 75, d: 98 },
    pylons: [[63.7, 407.4], [50, 27]],
    // en construction (signalé par le client, absent de l'orthophoto 2025) : emprise et tracé schématiques, à relever sur place
    publicParking: { cx: 185, cy: 378, w: 108, d: 36, rot: -0.335 },
    road: [[133, 502], [127, 470], [120, 440], [115, 418], [120, 402], [133, 396]],
    cycle: [[-38, 31], [3, 26], [28, 124], [54, 222], [80, 322], [108, 432], [118, 470], [124, 500]],
    southPath: [[3, 26], [60, 15], [123, -3], [154, -13]],
    drive: [[258, 366], [246, 335], [231, 300], [221, 285], [207, 285]],
    parcels: [["335/2816", 5084], ["335/2814", 4923], ["335/2812", 4864], ["335/1556", 4864], ["335/2810", 4564], ["335/2808", 7269], ["332/2804", 2710], ["331/2802", 5041], ["322/2800", 1794], ["320/2796", 1721], ["320/2798", 897], ["327", 463], ["317/1553", 2373], ["317/1552", 1790], ["318/2794", 8277], ["315", 1147], ["314/2792", 1620]]
  };
})();
