const videos = document.getElementById("videos");
let localStream;
let peers = {};

// Получение уникального идентификатора участника
let participantId = localStorage.getItem("participantId");
if (!participantId) {
    participantId = Math.random().toString(36).substr(2, 9);
    localStorage.setItem("participantId", participantId);
}

async function start() {
    // Ввод ссылки вручную, так как она сгенерирована администратором
    const link = prompt("Enter the meeting link:");
    const linkId = link.split("/").pop();

    const ws = new WebSocket(`ws://${window.location.host}/ws/${linkId}/${participantId}`);
    ws.onmessage = (event) => {
        const message = event.data;
        if (message.startsWith("participant_left:")) {
            const id = message.split(":")[1];
            removeVideo(id);
            resizeVideos();
        } else {
            const data = JSON.parse(message);
            handleSignalingData(data);
        }
    };

    ws.onopen = () => {
        console.log("Connected to the signaling server");
    };

    ws.onclose = async () => {
        console.log("Disconnected from the signaling server");
        await retryConnection();
    };

    async function getMedia() {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 30 }
                },
                audio: true
            });
            const localVideo = document.createElement("video");
            localVideo.srcObject = localStream;
            localVideo.muted = true;
            localVideo.autoplay = true;
            localVideo.id = "localVideo";
            videos.appendChild(localVideo);
            resizeVideos();
        } catch (error) {
            console.error("Error accessing media devices.", error);
        }
    }

    function createPeerConnection(id) {
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                {
                    urls: "turn:turnserver:3478",
                    username: "testuser",
                    credential: "testpassword"
                }
            ]
        });

        // Контроль пропускной способности
        peerConnection.onnegotiationneeded = async () => {
            const sender = peerConnection.getSenders().find(s => s.track.kind === 'video');
            if (sender) {
                const parameters = sender.getParameters();
                if (!parameters.encodings) {
                    parameters.encodings = [{}];
                }
                parameters.encodings[0].maxBitrate = 500 * 1000; // Максимальный битрейт 500 kbps
                await sender.setParameters(parameters);
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate, id: id }));
            }
        };

        peerConnection.ontrack = (event) => {
            const remoteVideo = document.createElement("video");
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.autoplay = true;
            remoteVideo.id = `video_${id}`;
            videos.appendChild(remoteVideo);
            resizeVideos();
        };

        localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));

        return peerConnection;
    }

    async function handleSignalingData(data) {
        switch (data.type) {
            case "offer":
                const peerConnection = createPeerConnection(data.id);
                peers[data.id] = peerConnection;
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                ws.send(JSON.stringify({ type: "answer", answer: answer, id: data.id }));
                break;
            case "answer":
                await peers[data.id].setRemoteDescription(new RTCSessionDescription(data.answer));
                break;
            case "candidate":
                await peers[data.id].addIceCandidate(new RTCIceCandidate(data.candidate));
                break;
        }
    }

    function removeVideo(id) {
        const videoElement = document.getElementById(`video_${id}`);
        if (videoElement) {
            videoElement.remove();
        }
    }

    function resizeVideos() {
        const videoElements = videos.getElementsByTagName("video");
        const numVideos = videoElements.length;
        const size = Math.ceil(Math.sqrt(numVideos)); // Calculate size needed for a square grid
        const width = 100 / size + "%";
        const height = 100 / size + "%";

        for (let video of videoElements) {
            video.style.width = width;
            video.style.height = height;
        }
    }

    document.getElementById("toggleVideo").onclick = () => {
        const videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
    };

    document.getElementById("toggleAudio").onclick = () => {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
    };

    await getMedia();

    async function retryConnection() {
        setTimeout(async () => {
            console.log("Attempting to reconnect...");
            start();
        }, 5000);
    }
}

start();
