## Duolingo MiniDict

A Greasemonkey / Tampermonkey user script that enhances language learning
on [Duolingo](https://www.duolingo.com) by providing dictionary (the words
you have learnt so far) look up functionality. 

## Features

To this script, simply click on the *Mdict* button to get access to your dictionary.

  * Type any keyword to search for the target vocabulary.
  * Words matching your search keyword will show up in the dropdown menu with
    following information:
    - *Grammatical genders for nouns* (only for certain languages)
    - *Infinitive forms for verbs*
    - *A short list of word explanation in your own language*
    - *The skill/lesson in which the word was teached*
  * Click on any word to reveal the detailed information (verb conjugation, 
    examples etc.)

Note that all the information about the vocabulary is retrieved using Duolingo's API. 
You will see the same information if you visit the [Words](https://www.duolingo.com/words) section
on Duolingo.

## Installation:

Since this is not a *standalone* script that can run on its own, you need to 
install the appropriate browser plugin before you can install the script.

  * Chrome/Opera: Install [Tampermonkey](http://tampermonkey.net/).
  * Firefox: Install [Greasemonkey](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/).

After installing Tampermonkey / Greasemonkey, 
  * [Click here to install the script](https://raw.githubusercontent.com/killkeeper/duolingo-minidict/master/Duolingo-MiniDict.user.js)

A quick indicator for successful installation is that you should be able to see
a *Mdict* button on the top navigation bar. If you have your Duolingo website
opened before installing the script, try refresh the browser.
