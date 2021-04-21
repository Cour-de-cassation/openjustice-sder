$(document).ready(function () {
  $('#button-check').on('click', function () {
    $('#accordionCheck').addClass('hidden');
    $('#button-check, #check-id').prop('disabled', true);
    $('#check-spinner').removeClass('hidden');
    $.get('/check/' + $('#check-id').val(), function (data) {
      $('#accordionCheck .card-body pre').empty();
      if (data.oracle.jurinet) {
        $('#contentOracleJurinet .card-body pre').text(JSON.stringify(data.oracle.jurinet, null, 2));
      } else {
        $('#contentOracleJurinet .card-body pre').text('none');
      }
      if (data.oracle.jurica) {
        $('#contentOracleJurica .card-body pre').text(JSON.stringify(data.oracle.jurica, null, 2));
      } else {
        $('#contentOracleJurica .card-body pre').text('none');
      }
      if (data.mongodb.jurinet) {
        $('#contentMongoJurinet .card-body pre').text(JSON.stringify(data.mongodb.jurinet, null, 2));
      } else {
        $('#contentMongoJurinet .card-body pre').text('none');
      }
      if (data.mongodb.jurica) {
        $('#contentMongoJurica .card-body pre').text(JSON.stringify(data.mongodb.jurica, null, 2));
      } else {
        $('#contentMongoJurica .card-body pre').text('none');
      }
      if (data.mongodb.decisions) {
        $('#contentMongoDecisions .card-body pre').text(JSON.stringify(data.mongodb.decisions, null, 2));
      } else {
        $('#contentMongoDecisions .card-body pre').text('none');
      }
      $('#accordionCheck').removeClass('hidden');
      $('#button-check, #check-id').prop('disabled', false);
      $('#check-spinner').addClass('hidden');
    });
  });
});
