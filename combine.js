const axios = require('axios');

async function getCombinedMessage() {
    try {
        const helloResponse = await axios.get('http://localhost:3002/hello'); /* alternatively 'http://127.0.0.1:59669/hello' can also be used - this url is returned when 'minikube service hello' is executed */
        const worldResponse = await axios.get('http://localhost:3003/world'); /* alternatively 'http://127.0.0.1:59692/world' can also be used - this url is returned when 'minikube service world' is executed */
        console.log(`${helloResponse.data} ${worldResponse.data}`);
    } catch (error) {
        console.error('Error fetching messages:', error);
    }
}
getCombinedMessage();
