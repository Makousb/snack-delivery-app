import axios from "axios";

export const initiateSTKPush = async (phone, amount) => {
  const url = "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

  const token = "YOUR_ACCESS_TOKEN"; // generate via OAuth

  const response = await axios.post(
    url,
    {
      BusinessShortCode: "174379",
      Password: "YOUR_PASSWORD",
      Timestamp: "20260410120000",
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: "174379",
      PhoneNumber: phone,
      CallBackURL: "https://yourdomain.com/api/mpesa/callback",
      AccountReference: "Restaurant Order",
      TransactionDesc: "Food Payment"
    },
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  return response.data;
};