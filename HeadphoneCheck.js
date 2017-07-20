(function(HeadphoneCheck, $, undefined) {

  /*** PUBLIC CONFIGURATION VARIABLES ***/
  HeadphoneCheck.totalTrials = 3;
  HeadphoneCheck.trialsPerPage = 1;
  HeadphoneCheck.correctThreshold = 2;
  HeadphoneCheck.useSequential = true;
  HeadphoneCheck.doShuffleTrials = true;
  HeadphoneCheck.sampleWithReplacement = true;
  HeadphoneCheck.doCalibration = true;
  HeadphoneCheck.debug = true;

  /*** PRIVATE CONFIGURATION VARIABLES ***/
  var storageBackend;
  var storageKey = 'headphoneCheckCache';
  var validColor = 'black';
  var warningColor = 'red';
  var requirePlayback = true;
  var defaultAudioType = 'audio/mpeg';

  var headphoneCheckData = {pageNum: 0,
                            stimIDList: [],
                            stimDataList: [],
                            trialScoreList: [],
                            responseList: [],
                            calibration: [],
                            jsonData: undefined,
                            lastPage: undefined,
                           };
  var st_isPlaying = false;

  /*** PUBLIC FUNCTIONS ***/
  HeadphoneCheck.runHeadphoneCheck = function(jsonPath, useCache) {
    setupHeadphoneCheck();
    HeadphoneCheck.loadStimuli(jsonPath, useCache);
  };

  /**
   * Load the experiment configuration, either by restoring cached values
   * from localStorage or by AJAX fetching from a URL.
   *
   * @param {jsonPath} title - URL to experiment configuration.
   * @param {useCache} title - If truthy, will attempt to load cached
   * values from localStorage. If this succeeds, data from the URL will
   * not be fetched. If this fails or is falsy, the data will be loaded
   * from the URL.
   */
  HeadphoneCheck.loadStimuli = function (jsonPath, useCache) {
    // attempt to load from cache
    console.log('Storage Backend: '+storageBackend);
    var didLoadCache = false;
    if (useCache) didLoadCache = restoreProgress();

    // if didn't load from cache, fetch the json file via ajax
    if (!didLoadCache) {
      $.ajax({
          dataType: 'json',
          url: jsonPath,
          async: true,
          success: function (data) {
            $(document).trigger('hcLoadStimuliSuccess', {'data': data});
            headphoneCheckData.jsonData = data;
            if (HeadphoneCheck.doShuffleTrials) {
              shuffleTrials(data.stimuli, HeadphoneCheck.totalTrials, HeadphoneCheck.sampleWithReplacement);
              console.log(headphoneCheckData.stimDataList);
            }
            if (HeadphoneCheck.doCalibration) {
              headphoneCheckData.calibration = data.calibration;
              console.log(headphoneCheckData.calibration);
            }
            console.log(headphoneCheckData.stimDataList.length)
            headphoneCheckData.lastPage = Math.ceil(headphoneCheckData.stimDataList.length / HeadphoneCheck.trialsPerPage); //get last page
            if (useCache) storeProgress();

            if (HeadphoneCheck.doCalibration) {
              HeadphoneCheck.renderHeadphoneCheckCalibration();
            }
            else {
              HeadphoneCheck.renderHeadphoneCheckPage();
            }
          },
          error: function (data) {
            $(document).trigger('hcLoadStimuliFail', {'data': data});
          },
          complete: function (data) {
            $(document).trigger('hcLoadStimuliDone', {'data': data});
          }
      });
    }
  };

  HeadphoneCheck.renderHeadphoneCheckPage = function() {
    // render boilerplate instruction text
    $('<div/>', {
      class: 'hc-instruction',
      html: 'When you hit <b>Play</b>, you will hear three sounds separated by silences.'
    }).appendTo($('#hc-container'));
    $('<div/>', {
      class: 'hc-instruction',
      text: 'Simply judge WHICH SOUND WAS SOFTEST (quietest) -- 1, 2, or 3?'
    }).appendTo($('#hc-container'));
    $('<div/>', {
      class: 'hc-instruction',
      text: 'Test sounds can only be played once!'
    }).appendTo($('#hc-container'));

    //get the stimuli to display on this page
    console.log(headphoneCheckData)
    for (i = 0; i < HeadphoneCheck.trialsPerPage; i++) {
      var trialInd = headphoneCheckData.pageNum * HeadphoneCheck.trialsPerPage + i;
      if (trialInd < HeadphoneCheck.totalTrials) {
        // prefix the stim id with the temporary (page) trial index, allows for duplicate trials
        var stimData = headphoneCheckData.stimDataList[trialInd];
        var stimID = headphoneCheckData.stimIDList[trialInd];
        // add in a group for each item in stimulus
        renderHeadphoneCheckTrial('hc-container', stimID , stimData.src);
      }
    }

    if (requirePlayback) {
      // no response until the sound is played
      $('.hc-buttonset-vertical').click(function(event) {
        var parentPlayButton = $(event.target).parents().filter('.hc-trial-div').find('button');

        // if the play button isn't disabled, it hasn't been played, so show a warning
        if (!$(parentPlayButton).prop('disabled')) {
          $(parentPlayButton).parent().css('border', '3px solid ' + warningColor);
          event.preventDefault();
        }

        var prefixStr = 'hc-radio-buttonset-';
        var stimID = this.id.slice(this.id.indexOf(prefixStr) + prefixStr.length);
        var response = getResponseFromRadioButtonGroup(stimID);
        if (response !== undefined) {
          parentPlayButton.parent().parent().css('border-color', validColor);
        }
      });
    }

    // Add button to continue
    $('<button/>', {
      text: 'Continue',
      click: function () {
        var canContinue = checkCanContinue();
        for (stimID = 0; stimID < HeadphoneCheck.trialsPerPage; stimID++) {
          var trialInd = headphoneCheckData.pageNum * HeadphoneCheck.trialsPerPage + stimID;
          var response = getResponseFromRadioButtonGroup(headphoneCheckData.stimIDList[trialInd]);
          scoreTrial(trialInd, headphoneCheckData.stimDataList[trialInd], response);
        }
        if (headphoneCheckData.pageNum == headphoneCheckData.lastPage - 1) { // TODO: -1 for indexing; make indexing consistent
          teardownHTMLPage();
          var didPass = checkPassFail(HeadphoneCheck.correctThreshold);
          console.log(headphoneCheckData)
          alert('did pass headphone check: '+didPass);
        }
        else if (canContinue) { // Advance the page
          teardownHTMLPage();
          headphoneCheckData.pageNum++;
          HeadphoneCheck.renderHeadphoneCheckPage();
        }
        else { // need responses, don't advance page, show warnings
          renderResponseWarnings();
        }
      }
    }).appendTo($('#hc-container'));
  };

  HeadphoneCheck.renderHeadphoneCheckCalibration = function() {
    // render boilerplate instruction text
    $('<div/>', {
      class: 'hc-calibration-instruction',
      text: 'You must be wearing headphones to do this HIT!'
    }).appendTo($('#hc-container'));
    $('<div/>', {
      class: 'hc-calibration-instruction',
      text: 'Level Calibration'
    }).appendTo($('#hc-container'));
    $('<div/>', {
      class: 'hc-calibration-instruction',
      text: 'First, set your computer volume to about 25% of maximum.'
    }).appendTo($('#hc-container'));
    $('<div/>', {
      class: 'hc-calibration-instruction',
      text: 'Press the button, then turn up the volume on your computer until the ' +
            'calibration noise is at a loud but comfortable level.'
    }).appendTo($('#hc-container'));
    $('<div/>', {
      id: 'hc-calibration-div',
      text: 'Play the calibration sound as many times as you like.'
    }).appendTo($('#hc-container'));

    //add in the audio source
    $('<audio/>', {
        id: 'hc-calibration-audio',
        // type: 'audio/mpeg', // TODO: Factor this out, should be user defined
        // type: parseAudioType(stimID),
        src: headphoneCheckData.calibration.src
      }).appendTo($('#hc-calibration-div'));

    //add in the button for playing the sound
    $('<button/>', {
      id: 'hc-calibration-play-button' ,
      disabled: false,
      click: function () {
        if (!st_isPlaying){
          playCalibration('hc-calibration-audio');
        }
        $('#hc-calibration-continue-button').prop('disabled', false);
      },
      text: 'Play',
    }).css('display', 'block').appendTo($('#hc-calibration-div'));

    $('<div/>', {
      class: 'hc-calibration-instruction',
      html: 'Press <b>Continue</b> when level calibration is complete.',
    }).appendTo($('#hc-container'));

    // Add button to continue
    $('<button/>', {
      id: 'hc-calibration-continue-button',
      class: 'hc-calibration-instruction',
      disabled: true,
      text: 'Continue',
      click: function () {
        teardownHTMLPage();
        HeadphoneCheck.renderHeadphoneCheckPage();
      }
    }).appendTo($('#hc-container'));
  };

  /*** PRIVATE FUNCTIONS ***/
  /**
   * Initialize the headphone check and setup the environment
   *
   * @return {undefined}
   */
  function setupHeadphoneCheck() {
    // set the storage backend
    storageBackend = isStorageAvailable() ? sessionStorage : undefined;
  }

  /**
   * Check if storage is available via localStorage and sessionStorage.
   * NOTE: this can misbehave if the storage is full.
   *
   * @return {Boolean} - Indicates if localStorage and sessionStorage are
   * available.
   */
  function isStorageAvailable(){
    var test = 'test';
    try {
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      sessionStorage.setItem(test, test);
      sessionStorage.removeItem(test);
      return true;
    }
    catch(e) {
      $(document).trigger('hcStorageUnavailable');
      return false;
    }
  }

  /**
   * Attempt to load the cached progress state from a JSON string in
   * local storage.
   *
   * @return {bool} - Indicates if restore was successful.
   */
  function restoreProgress() {
    var didRestore = false;
    if (storageBackend !== undefined && storageKey in storageBackend) {
      // Code for localStorage/sessionStorage
      headphoneCheckData = JSON.parse(storageBackend.getItem(storageKey));
      $(document).trigger('hcRestoreProgressSuccess');
      didRestore = true;
    }
    else {
      // No Web Storage support..
      $(document).trigger('hcRestoreProgressFail');
    }
    return didRestore;
  }

  function storeProgress() {
    if (storageBackend !== undefined) {
      storageBackend.setItem(storageKey, JSON.stringify(headphoneCheckData));
      $(document).trigger('hcStoreProgressSuccess');
    }
    else {
      // No Web Storage support..
      $(document).trigger('hcStoreProgressFail');
    }
  }

  function scoreTrial(trialInd, stimData, response) {
    if (response !== undefined) {
      var score = stimData.correct == response ? 1 : 0;
      headphoneCheckData.trialScoreList[trialInd] = score;
      headphoneCheckData.responseList[trialInd] = response;
      return score;
    }
  }

  //FUNCTIONS FOR INITIALIZING THE STIMULI AND SHUFFLING THE JSON FILE
  function randomInt(a, b, n) {
    // generate n random integers between [a, b)
    var randIntList = [];
    var minVal = Math.min(a, b);
    var maxVal = Math.max(a, b);
    for (var i = 0; i < n; i++) {
      randIntList.push(Math.floor(minVal + (maxVal - minVal) * Math.random()));
    }
    outVal = n == 1 ? randIntList[0] : randIntList;
    return outVal;
  }

  function sampleWithReplacement(arr, n) {
    samples = [];
    for(var i = 0; i < n; i++) {
      ind = randomInt(0, arr.length, 1);
      samples.push(arr[ind]);
    }
    return samples;
  }

  // function sampleWithoutReplacement(inarr, n) {
  //   var arr = JSON.parse(JSON.stringify(inarr));
  //   samples = [];
  //   for(var i = 0; i < n; i++) {
  //     ind = randomInt(arr.length);
  //     samples.push(arr[ind]);
  //     arr.splice(ind, 1);
  //   }
  //   return samples;
  // }

  function shuffle(array, n) {
    if (n === undefined) {
      n = array.length;
    }
    else if (n <= 0) {
      n = array.length;
      console.warn('Requested samples is not greater than 0. Using full array.');
    }
    else if (n > array.length) {
      n = array.length;
      console.warn('Requested more samples than there are available; use sampleWithReplacement. Using full array.');
    }
    var nInd = n;

    var currentIndex = array.length, temporaryValue, randomIndex;
    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;

      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }
    return array.slice(0, nInd);
  }

  function shuffleTrials(trialArray, n, withReplacement) {
    console.log('n: ' + n +' w/R: ' + withReplacement)
    var shuffledTrials = withReplacement ? sampleWithReplacement(trialArray, n) : shuffle(trialArray, n);
    headphoneCheckData.stimDataList = shuffledTrials;
    headphoneCheckData.stimIDList = headphoneCheckData.stimDataList.map(function (val, ind) {
      // prefix the stim id with the temporary (page) trial index, allows for duplicate trials
       return 'trial' + ind + '-src' + val.id;
    });
    headphoneCheckData.trialScoreList = Array(headphoneCheckData.stimDataList.length); // TODO: is there a better place for this?
  }

  // TODO: fix this, this doesn't work
  function parseAudioType(stimID) {
    console.log('TYPE: ' +stimID);
    console.log(headphoneCheckData.stimDataList);
    var typeStr = headphoneCheckData.stimDataList[stimID];
    console.log('TYPE: '+typeStr);
    if (typeStr === undefined) {
      typeStr = defaultAudioType;
    }
    console.log('TYPE: '+typeStr);
    return typeStr;
  }

  function getTotalCorrect(array) {
    return array.reduce(function getSum(total, val) {
      var num = val === undefined ? 0 : val;
      return total + num;
    });
  }

  function checkPassFail(correctThreshold) {
    var totalCorrect = getTotalCorrect(headphoneCheckData.trialScoreList);
    return totalCorrect >= correctThreshold;
  }

  function playStim(stimID) {
    var trialID = stimID.slice(0, stimID.indexOf('-'));
    var previousTrialID = trialID - 1;
    if (HeadphoneCheck.useSequential && previousTrialID >= 0) {
      var response = getResponseFromRadioButtonGroup(headphoneCheckData.stimIDList[previousTrialID]);
      if (response === undefined && headphoneCheckData.trialScoreList[previousTrialID] === undefined) {
        $('#hc-stim-' + headphoneCheckData.stimIDList[previousTrialID]).css('border-color', warningColor);
        return;
      }
    }

    // playback will occur
    disableClick('hc-play-button-' + stimID);
    var stimFile = 'hc-audio-' + stimID;
    // set onended callback
    $('#' + stimFile).on('ended', function() {
      // reset playback state
      st_isPlaying = false;
      // activate responses
      if (requirePlayback) $('#hc-radio-buttonset-' + stimID).css('pointer-events', 'auto');
    });

    // clear warnings
    var trialBackgroundColor = $('#hc-play-button-border-' + stimID).parent().css('background-color');
    $('#hc-play-button-border-' + stimID).css('border-color', trialBackgroundColor);

    // play and set state
    $('#' + stimFile).get(0).play();
    st_isPlaying = true;
    // hack to disable responding during playback
    $('#hc-radio-buttonset-' + stimID).css('pointer-events', 'none');
  }

  function playCalibration(calibrationFile) {
    $('#' + calibrationFile).on('ended', function() {
      // reset playback state
      st_isPlaying = false;
    });
    $('#' + calibrationFile).get(0).play();
    st_isPlaying = true;
  }

  function disableClick(buttonID) {
    $('#' + buttonID).prop('disabled', true);
  }

  function checkCanContinue() {
    // Check that each question has a response, if not, highlight what is needed
    // TODO: This is HACKY and probably isn't the best idea
    numResponses = $('.hc-buttonset-vertical>label>input[type=radio]:checked').length;
    return numResponses >= HeadphoneCheck.trialsPerPage; // easy for user to circumvent check
  }

  function renderResponseWarnings() {
    // toggle the response warnings

    // get parent div of anything checked, should only be 1 radio button per div
    var checked = $('.hc-buttonset-vertical>label>input[type=radio]:checked').parent().parent();

    // get parent divs of anything unchecked, can be as many as # of responses
    var unchecked = $('.hc-buttonset-vertical>label>input[type=radio]').not(':checked').parent().parent();

    // get all top level divs (i.e., trial containers) without any responses
    var uncheckedTrials = $(unchecked).not(checked).parent();

    // hide warning on completed trials
    $(checked).parent().css('border', '5px solid ' + validColor);

    // show warning on empty trials
    $(uncheckedTrials).css('border', '5px solid ' + warningColor);
  }

  function getResponseFromRadioButtonGroup(elemID) {
    console.log('####################### '+ elemID)
    return $('#hc-radio-buttonset-'+elemID+'>label>input:checked').val();
  }

  // renderHTML takes in the stimulus ID and the stimulus file and creates a div
  // element with everything needed to play and respond to this sound
  function renderHeadphoneCheckTrial(stimDiv, stimID, stimFile) {
    console.log('--->' +' '+ stimDiv + stimID + ', ' + stimFile)
    if (stimFile === undefined) return;
    var divID = 'hc-stim-' + stimID;
    $('<div/>', {id: divID, class: 'hc-trial-div'}).appendTo(('#' + stimDiv));

    //add in the audio source
    $('<audio/>', {
        id: 'hc-audio-' + stimID,
        // type: 'audio/mpeg', // TODO: Factor this out, should be user defined
        // type: parseAudioType(stimID),
        src: stimFile
      }).appendTo($('#' + divID));

    if (HeadphoneCheck.debug) {
      $('<div/>', {
          text: 'Trial ID: ' + stimID
      }).appendTo($('#' + divID));
    }

    var trialBackgroundColor = $('#'+divID).css('background-color');
    $('<div/>', {id: 'hc-play-button-border-' + stimID,})
    .css({'border': '3px solid ' + trialBackgroundColor, 'display': 'inline-block'})
    .append(
      $('<button/>', {
        id: 'hc-play-button-' + stimID,
        text: 'Play',
        disabled: false,
        click: function () {
          if (!st_isPlaying) playStim(stimID);
        },
      }))
    .appendTo($('#' + divID));

    //add in the radio buttons for selecting which sound was softest
    $('<div/>', {
      id: 'hc-radio-buttonset-' + stimID,
      class: 'hc-buttonset-vertical',
    }).appendTo($('#' + divID));

    //give the label info for the buttons
    var radioButtonInfo = [
                            {'id': '1', 'name': 'FIRST sound was SOFTEST'},
                            {'id': '2', 'name': 'SECOND sound was SOFTEST'},
                            {'id': '3', 'name': 'THIRD sound was SOFTEST'},
                          ];

    $.each(radioButtonInfo, function() {
      $('#hc-radio-buttonset-' + stimID)
      .append($('<label/>', {
          for: 'hc-radio' + this.id + '-stim-' + stimID,
          class: 'hc-radio-label',
          text: this.name,
        })
      .prepend($('<input/>', {
                type: 'radio',
                id: 'hc-radio' + this.id + '-stim-' + stimID,
                name: 'hc-radio-response-' + stimID,
                class: 'hc-radio-response',
                value: this.id,
              })
      ));
    });
  }

  function teardownHTMLPage() {
    $('#hc-container').empty();
  }

}( window.HeadphoneCheck = window.HeadphoneCheck || {}, jQuery));



/***********************************/
/******** EXAMPLE USER CODE ********/
/***********************************/
$(document).ready(function() {
  $(document).on('hcStorageUnavailable', function(event, param1) {
    alert(event.type);
  });
  $(document).on('hcRestoreProgressSuccess', function(event, param1) {
    alert(event.type);
  });
  $(document).on('hcRestoreProgressFail', function(event, param1) {
    alert(event.type);
  });
  // $(document).on('hcLoadStimuliDone', function( event, param1) {
  //   alert( event.type );
  // });

  var useCache = false;
  var jsonPath = 'headphone_check_stim.json';
  HeadphoneCheck.runHeadphoneCheck(jsonPath, useCache);
});

