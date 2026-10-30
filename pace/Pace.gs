/****************************************************************************************
 * Pace.gs: único script do projeto da planilha "WL BR | Influencers - PACING V3".
 *
 * A planilha do pacing é pesada demais para o motor da base rodar dentro dela (o Apps Script
 * dá timeout ao acessar o documento). Por isso o motor roda na planilha da base
 * (BASE_INFLUENCERS_WL, formato longo) e o pacing só LÊ essa aba por IMPORTRANGE.
 *
 * A aba 'Acquisition: Paid Creators' continua sendo uma fórmula:
 *   - até a véspera de Config!B14 (01/11/2026): igual a antes (H_Spend, H_Mixpanel, H_Checkouts)
 *   - a partir de Config!B14: BASE_INFLUENCERS_WL da planilha em Config!B15, com o cupom
 *     passando pelo de-para da aba Mapeamento (Cupom D->E e UTM J->K) e reagrupado.
 * Config!C15 tem um IMPORTRANGE simples só para liberar o acesso entre as planilhas.
 *
 * configurarPace(): grava Config!A14:C15 (se vazios), guarda a fórmula anterior em Config!B16 e
 * troca a fórmula de A2. desfazerPace() volta a fórmula anterior. Rodar pelo editor.
 ****************************************************************************************/

var PACE = {
  ABA_SAIDA: 'Acquisition: Paid Creators',
  CORTE_PADRAO: [2026, 11, 1],
  URL_BASE: 'https://docs.google.com/spreadsheets/d/1NCrckOSsHT60gmXKnJLZnRQnHuFh2FaPnEUkQJ8cROg',
  ABA_BASE: 'BASE_INFLUENCERS_WL'
};

function formulaPace_() {
  return [
    '=ARRAYFORMULA(LET(',
    '  ini, Config!$B$2,',
    '  fim, Config!$B$3,',
    '  corte, Config!$B$14,',
    '  fimV, MIN(fim, corte - 1),',
    '  base, FILTER(H_Spend!A2:D, H_Spend!A2:A<>"", H_Spend!D2:D<>0, H_Spend!A2:A<corte),',
    '  sp, QUERY(base, "select Col1, Col2, sum(Col4) group by Col1, Col2 label sum(Col4) \'\'", 0),',
    '  comp, IF(UPPER(TRIM(Config!$B$6))="SIM", base, HSTACK(ini, "", "", 0)),',
    '  mx, QUERY(FILTER(H_Mixpanel!A2:D, H_Mixpanel!B2:B<>"", H_Mixpanel!A2:A>=ini, H_Mixpanel!A2:A<=fimV), "select Col1, Col2, Col3, sum(Col4) group by Col1, Col2, Col3 label sum(Col4) \'\'", 0),',
    '  ord, QUERY(FILTER(H_Checkouts!A2:E, H_Checkouts!D2:D<>"", H_Checkouts!A2:A>=ini, H_Checkouts!A2:A<=fimV), "select Col1, Col4, sum(Col5) group by Col1, Col4 label sum(Col5) \'\'", 0),',
    '  pay, QUERY(FILTER(H_Checkouts!A2:E, H_Checkouts!D2:D<>"", H_Checkouts!C2:C="Yes", H_Checkouts!A2:A>=ini, H_Checkouts!A2:A<=fimV), "select Col1, Col4, sum(Col5) group by Col1, Col4 label sum(Col5) \'\'", 0),',
    '  acq, QUERY(FILTER(H_Checkouts!A2:E, H_Checkouts!D2:D<>"", H_Checkouts!C2:C="Yes", ISNUMBER(H_Checkouts!B2:B), H_Checkouts!B2:B>=ini, H_Checkouts!B2:B<=fimV), "select Col2, Col4, sum(Col5) group by Col2, Col4 label sum(Col5) \'\'", 0),',
    '  imp, IFERROR(IMPORTRANGE(Config!$B$15, "' + PACE.ABA_BASE + '!A2:F"), HSTACK(ini, "", "", "", "", 0)),',
    '  d, CHOOSECOLS(imp, 1),',
    '  irs, IFERROR(FILTER(imp, ISNUMBER(d), d>=corte, d>=ini, d<=fim), HSTACK(ini, "", "", "", "", 0)),',
    '  cupR, UPPER(TRIM(CHOOSECOLS(irs, 4))),',
    '  m1, IFERROR(VLOOKUP(cupR, HSTACK(UPPER(TRIM(Mapeamento!$D$2:$D)), Mapeamento!$E$2:$E), 2, FALSE), ""),',
    '  m2, IFERROR(VLOOKUP(cupR, HSTACK(UPPER(TRIM(Mapeamento!$J$2:$J)), Mapeamento!$K$2:$K), 2, FALSE), ""),',
    '  cupF, IF(m1<>"", m1, IF(m2<>"", m2, CHOOSECOLS(irs, 4))),',
    '  iris, QUERY(HSTACK(CHOOSECOLS(irs, 1), cupF, CHOOSECOLS(irs, 5), CHOOSECOLS(irs, 6)), "select Col1, Col2, Col3, sum(Col4) group by Col1, Col2, Col3 label sum(Col4) \'\'", 0),',
    '  todos, VSTACK(',
    '    HSTACK(CHOOSECOLS(sp, 1), CHOOSECOLS(sp, 2), IF(SEQUENCE(ROWS(sp))>0, "Spend"), CHOOSECOLS(sp, 3)),',
    '    comp,',
    '    mx,',
    '    HSTACK(CHOOSECOLS(ord, 1), CHOOSECOLS(ord, 2), IF(SEQUENCE(ROWS(ord))>0, "Orders"), CHOOSECOLS(ord, 3)),',
    '    HSTACK(CHOOSECOLS(pay, 1), CHOOSECOLS(pay, 2), IF(SEQUENCE(ROWS(pay))>0, "Payment Completed"), CHOOSECOLS(pay, 3)),',
    '    HSTACK(CHOOSECOLS(acq, 1), CHOOSECOLS(acq, 2), IF(SEQUENCE(ROWS(acq))>0, "Acquisitions"), CHOOSECOLS(acq, 3)),',
    '    iris),',
    '  srt, SORT(FILTER(todos, CHOOSECOLS(todos, 4)<>0), 1, TRUE, 2, TRUE, 3, TRUE),',
    '  HSTACK(CHOOSECOLS(srt, 1), IF(SEQUENCE(ROWS(srt))>0, "Influence"), IF(SEQUENCE(ROWS(srt))>0, "Influencers"), CHOOSECOLS(srt, 2), CHOOSECOLS(srt, 3), ROUND(CHOOSECOLS(srt, 4), 2))',
    '))'
  ].join('\n');
}

function configurarPace() {
  var ss = SpreadsheetApp.getActive();
  var cfg = ss.getSheetByName('Config');
  var saida = ss.getSheetByName(PACE.ABA_SAIDA);
  if (!cfg || !saida) throw new Error('Abas Config ou ' + PACE.ABA_SAIDA + ' não encontradas.');

  if (!cfg.getRange('B14').getValue()) {
    var c = PACE.CORTE_PADRAO;
    cfg.getRange('A14:B14').setValues([['Base Irís a partir de', new Date(c[0], c[1] - 1, c[2])]]);
    cfg.getRange('B14').setNumberFormat('dd/MM/yyyy');
  }
  if (!cfg.getRange('B15').getValue()) {
    cfg.getRange('A15:B15').setValues([['Planilha da base Irís (URL)', PACE.URL_BASE]]);
    cfg.getRange('C15').setFormula('=IFERROR(IMPORTRANGE(B15, "' + PACE.ABA_BASE + '!A1"), "Liberar acesso: clique aqui e em Permitir acesso")');
  }

  var atual = saida.getRange('A2').getFormula();
  if (atual && atual.indexOf('IMPORTRANGE') < 0 && atual.indexOf('H_Iris') < 0) {
    cfg.getRange('A16:B16').setValues([['Fórmula anterior de ' + PACE.ABA_SAIDA + '!A2 (backup)', "'" + atual]]);
  }
  saida.getRange('A2').setFormula(formulaPace_());
}

/** Volta a fórmula anterior (backup em Config!B16). */
function desfazerPace() {
  var ss = SpreadsheetApp.getActive();
  var backup = String(ss.getSheetByName('Config').getRange('B16').getValue() || '');
  if (backup.charAt(0) !== '=') throw new Error('Sem backup da fórmula em Config!B16');
  ss.getSheetByName(PACE.ABA_SAIDA).getRange('A2').setFormula(backup);
}
