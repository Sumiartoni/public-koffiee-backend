import axios from 'axios';

// GANTI URL INI DENGAN URL BACKEND ANDA (Local atau Production)
// Jika test di server langsung: http://localhost:3001
const BACKEND_URL = 'http://localhost:3001';

const amountToTest = process.argv[2];

if (!amountToTest) {
    console.log("Mohon masukkan nominal unik yang ingin dikonfirmasi.");
    console.log("Contoh: node simulate_payment.js 15123");
    process.exit(1);
}

async function simulate() {
    try {
        console.log(`Mengirim simulasi pembayaran sebesar Rp ${amountToTest} ke ${BACKEND_URL}...`);

        const response = await axios.post(`${BACKEND_URL}/api/payment/callback`, {
            amount: Number(amountToTest),
            description: "SIMULASI_TEST_MANUAL",
            sender: "MACRODROID_TEST"
        });

        console.log("\n✅ RESPON SERVER:");
        console.log(JSON.stringify(response.data, null, 2));

        if (response.data.status === 'success') {
            console.log("\n🎉 SUKSES! Order berhasil dikonfirmasi LUNAS.");
        } else {
            console.log("\n⚠️ GAGAL MATCHING: Tidak ditemukan order PENDING dengan nominal persis segitu.");
        }

    } catch (error) {
        console.error("\n❌ ERROR:", error.response ? error.response.data : error.message);
    }
}

simulate();
