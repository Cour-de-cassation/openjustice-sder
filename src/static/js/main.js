$(document).ready(function () {
  $('#button-check').on('click', function () {
    $('#accordionCheck').addClass('hidden');
    $('#button-check, #check-id').prop('disabled', true);
    $('#check-spinner').removeClass('hidden');
    $.get('/check/' + $('#check-id').val(), function (data) {
      $('#accordionCheck .card-body pre').empty();
      if (data.oracle.jurinet) {
        $('#headingOracleJurinet .badge').removeClass('badge-secondary').addClass('badge-info').text(1);
        $('#contentOracleJurinet .card-body pre').text(JSON.stringify(data.oracle.jurinet, null, 2));
      } else {
        $('#headingOracleJurinet .badge').removeClass('badge-info').addClass('badge-secondary').text(0);
        $('#contentOracleJurinet .card-body pre').text('None');
      }
      if (data.oracle.jurica) {
        $('#headingOracleJurica .badge').removeClass('badge-secondary').addClass('badge-info').text(1);
        $('#contentOracleJurica .card-body pre').text(JSON.stringify(data.oracle.jurica, null, 2));
      } else {
        $('#headingOracleJurica .badge').removeClass('badge-info').addClass('badge-secondary').text(0);
        $('#contentOracleJurica .card-body pre').text('None');
      }
      if (data.mongodb.jurinet) {
        $('#headingMongoJurinet .badge').removeClass('badge-secondary').addClass('badge-info').text(1);
        $('#contentMongoJurinet .card-body pre').text(JSON.stringify(data.mongodb.jurinet, null, 2));
      } else {
        $('#headingMongoJurinet .badge').removeClass('badge-info').addClass('badge-secondary').text(0);
        $('#contentMongoJurinet .card-body pre').text('None');
      }
      if (data.mongodb.jurica) {
        $('#headingMongoJurica .badge').removeClass('badge-secondary').addClass('badge-info').text(1);
        $('#contentMongoJurica .card-body pre').text(JSON.stringify(data.mongodb.jurica, null, 2));
      } else {
        $('#headingMongoJurica .badge').removeClass('badge-info').addClass('badge-secondary').text(0);
        $('#contentMongoJurica .card-body pre').text('None');
      }
      if (data.mongodb.decisions) {
        $('#headingMongoDecisions .badge')
          .removeClass('badge-secondary')
          .addClass('badge-info')
          .text(data.mongodb.decisions.length);
        $('#contentMongoDecisions .card-body pre').text(JSON.stringify(data.mongodb.decisions, null, 2));
      } else {
        $('#headingMongoDecisions .badge').removeClass('badge-info').addClass('badge-secondary').text(0);
        $('#contentMongoDecisions .card-body pre').text('None');
      }
      $('#accordionCheck').removeClass('hidden');
      $('#button-check, #check-id').prop('disabled', false);
      $('#check-spinner').addClass('hidden');
    });
  });

  $('#button-decatt').on('click', function () {
    $('#accordionCheck').addClass('hidden');
    $('#button-decatt, #decatt-id').prop('disabled', true);
    $('#decatt-spinner').removeClass('hidden');
    $.get('/decatt/' + $('#decatt-id').val(), function (data) {
      $('#accordionCheck .card-body pre').empty();
      $('#headingOracleJurinet .badge').removeClass('badge-info').addClass('badge-secondary').text(0);
      $('#contentOracleJurinet .card-body pre').text('None');
      if (data.found && data.decatt_id) {
        $('#headingOracleJurica .badge').removeClass('badge-secondary').addClass('badge-info').text(1);
        $('#contentOracleJurica .card-body pre').text(data.decatt_id);
      } else {
        $('#headingOracleJurica .badge').removeClass('badge-info').addClass('badge-secondary').text(0);
        $('#contentOracleJurica .card-body pre').text('None');
      }
      $('#headingMongoJurinet .badge').removeClass('badge-info').addClass('badge-secondary').text(0);
      $('#contentMongoJurinet .card-body pre').text('None');
      $('#headingMongoJurica .badge').removeClass('badge-info').addClass('badge-secondary').text(0);
      $('#contentMongoJurica .card-body pre').text('None');
      $('#headingMongoDecisions .badge').removeClass('badge-info').addClass('badge-secondary').text(0);
      $('#contentMongoDecisions .card-body pre').text('None');
      $('#accordionCheck').removeClass('hidden');
      $('#button-decatt, #decatt-id').prop('disabled', false);
      $('#decatt-spinner').addClass('hidden');
    });
  });
});
