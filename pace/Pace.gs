/****************************************************************************************
 * Pace.gs: integração com a planilha "WL BR | Influencers - PACING V3".
 *
 * A aba 'Acquisition: Paid Creators' é uma fórmula. Até a véspera da data de corte
 * (Config!B14, 01/11/2026) ela segue exatamente como antes (H_Spend, H_Mixpanel, H_Checkouts).
 * A partir do corte, lê a aba auxiliar H_Iris, gerada por este script com a mesma lógica da
 * base de teste (Irís + lake + Mixpanel direto + medicação por CPF).
 *
 * configurarPace(): grava o corte em Config!A14:B14 (se vazio), troca a fórmula de
 * 'Acquisition: Paid Creators'!A2, guarda a fórmula anterior em Config!A16:B16 e esconde as
 * abas auxiliares. Rodar uma vez. desfazerPace() volta a fórmula anterior.
 ****************************************************************************************/

var PACE = {
  ABA_SAIDA: 'Acquisition: Paid Creators',
  CELULA_CORTE: 'B14',
  CORTE_PADRAO: '2026-11-01',
  CELULA_BACKUP: 'B16'
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
    '  iris, IFERROR(FILTER(H_Iris!A2:D, ISNUMBER(H_Iris!A2:A), H_Iris!A2:A>=corte, H_Iris!A2:A>=ini, H_Iris!A2:A<=fim), HSTACK(ini, "", "", 0)),',
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

  var corte = cfg.getRange(PACE.CELULA_CORTE);
  if (!corte.getValue()) {
    cfg.getRange('A14').setValue('Base Irís a partir de');
    var p = PACE.CORTE_PADRAO.split('-');
    corte.setValue(new Date(+p[0], +p[1] - 1, +p[2])).setNumberFormat('dd/MM/yyyy');
  }

  var atual = saida.getRange('A2').getFormula();
  var nova = formulaPace_();
  if (atual && atual !== nova && atual.indexOf('H_Iris') < 0) {
    cfg.getRange('A16').setValue('Fórmula anterior de ' + PACE.ABA_SAIDA + '!A2 (backup)');
    cfg.getRange(PACE.CELULA_BACKUP).setValue("'" + atual);
  }
  saida.getRange('A2').setFormula(nova);

  [CFG.ABA_BASE, CFG.ABA_FUNIL, CFG.ABA_LOG].forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (sh && !sh.isSheetHidden()) sh.hideSheet();
  });
  logar_('PACE', 'ok', 0, 'Fórmula de ' + PACE.ABA_SAIDA + ' com corte em Config!' + PACE.CELULA_CORTE);
}

/** Volta a fórmula anterior (backup em Config!B16). */
function desfazerPace() {
  var ss = SpreadsheetApp.getActive();
  var backup = String(ss.getSheetByName('Config').getRange(PACE.CELULA_BACKUP).getValue() || '');
  if (backup.charAt(0) !== '=') throw new Error('Sem backup da fórmula em Config!' + PACE.CELULA_BACKUP);
  ss.getSheetByName(PACE.ABA_SAIDA).getRange('A2').setFormula(backup);
  logar_('PACE', 'ok', 0, 'Fórmula anterior restaurada');
}
