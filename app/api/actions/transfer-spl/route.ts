import {
  ActionPostResponse,
  ACTIONS_CORS_HEADERS,
  createPostResponse,
  ActionGetResponse,
  ActionPostRequest,
} from "@solana/actions";
import {
  Account,
  Authorized,
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Signer,
  StakeProgram,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import * as splToken from "@solana/spl-token";
import { DEFAULT_SOL_ADDRESS, DEFAULT_SOL_AMOUNT } from "./const";
const SOLANA_MAINNET_USDC_PUBKEY = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export const GET = async (req: Request) => {
  try {
    const requestUrl = new URL(req.url);
    const { toPubkey } = validatedQueryParams(requestUrl);

    const baseHref = new URL(
      `/api/actions/transfer-usdc-spl?to=${toPubkey.toBase58()}`,
      requestUrl.origin
    ).toString();

    const payload: ActionGetResponse = {
      title: "Actions Example - Transfer USDC SPL",
      icon: new URL("/smb.png", requestUrl.origin).toString(),
      description: "Transfer USDC SPL to another Solana wallet",
      label: "Transfer", // this value will be ignored since `links.actions` exists
      links: {
        actions: [
          {
            label: "Send 10 USDC", // button text
            href: `${baseHref}&amount=${"1"}`,
          },
          {
            label: "Send 50 USDC", // button text
            href: `${baseHref}&amount=${"5"}`,
          },
          {
            label: "Send 100 USDC", // button text
            href: `${baseHref}&amount=${"10"}`,
          },
          {
            label: "Send USDC", // button text
            href: `${baseHref}&amount={amount}`, // this href will have a text input
            parameters: [
              {
                name: "amount", // parameter name in the `href` above
                label: "Enter the amount of USDC to send", // placeholder of the text input
                required: true,
              },
            ],
          },
        ],
      },
    };

    return Response.json(payload, {
      headers: ACTIONS_CORS_HEADERS,
    });
  } catch (err) {
    console.log(err);
    let message = "An unknown error occurred";
    if (typeof err == "string") message = err;
    return new Response(message, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }
};

// DO NOT FORGET TO INCLUDE THE `OPTIONS` HTTP METHOD
// THIS WILL ENSURE CORS WORKS FOR BLINKS
export const OPTIONS = GET;

export const POST = async (req: Request) => {
  try {
    const requestUrl = new URL(req.url);
    const { amount, toPubkey } = validatedQueryParams(requestUrl);

    const body: ActionPostRequest = await req.json();

    // validate the client provided input
    let account: PublicKey;
    try {
      account = new PublicKey(body.account);
    } catch (err) {
      return new Response('Invalid "account" provided', {
        status: 400,
        headers: ACTIONS_CORS_HEADERS,
      });
    }

    const connection = new Connection(process.env.SOLANA_RPC! || clusterApiUrl("devnet"));
    const decimals = 6; // In the example, we use 6 decimals for USDC
    const mintAddress = new PublicKey(SOLANA_MAINNET_USDC_PUBKEY); // replace this with any SPL token mint address
    const fromWallet = account;

    // converting value to fractional units

    let transferAmount = parseFloat(amount.toFixed(decimals));
    transferAmount = transferAmount * Math.pow(10, decimals);

    const fromTokenAccount = await splToken.getAssociatedTokenAddress(
      mintAddress,
      account,
      false,
      splToken.TOKEN_PROGRAM_ID,
      splToken.ASSOCIATED_TOKEN_PROGRAM_ID
    );

    let oncurve = true;
    if (PublicKey.isOnCurve(account.toString())) {
      oncurve = false;
    }
    console.log("oncurve:", oncurve);

    let toTokenAccount = await splToken.getAssociatedTokenAddress(
      mintAddress,
      account,
      oncurve,
      splToken.TOKEN_PROGRAM_ID,
      splToken.ASSOCIATED_TOKEN_PROGRAM_ID
    );

    let createATA: boolean = Boolean(false);
    await splToken
      .getAccount(connection, toTokenAccount, "confirmed", splToken.TOKEN_PROGRAM_ID)
      .then(function (response) {
        createATA = false;
      })
      .catch(function (error) {
        if (error.name == "TokenAccountNotFoundError") {
          createATA = true;
        } else {
          return;
        }
      });

    let instructions = [];

    if (createATA === true) {
      let createATAiX = splToken.createAssociatedTokenAccountInstruction(
        account,
        toTokenAccount,
        toPubkey,
        mintAddress,
        splToken.TOKEN_PROGRAM_ID,
        splToken.ASSOCIATED_TOKEN_PROGRAM_ID
      );
      instructions.push(createATAiX);
    }

    let transferInstruction = splToken.createTransferInstruction(
      fromTokenAccount,
      toTokenAccount,
      account,
      transferAmount
    );
    instructions.push(transferInstruction);

    const transaction = new Transaction();
    transaction.feePayer = account;

    transaction.instructions = instructions;

    // set the end user as the fee payer
    transaction.feePayer = account;

    transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const payload: ActionPostResponse = await createPostResponse({
      fields: {
        transaction,
        message: `Send ${amount} USDC to ${toPubkey.toBase58()}`,
      },
      // note: no additional signers are needed
      // signers: [],
    });

    return Response.json(payload, {
      headers: ACTIONS_CORS_HEADERS,
    });
  } catch (err) {
    console.log(err);
    let message = "An unknown error occurred";
    if (typeof err == "string") message = err;
    return new Response(message, {
      status: 400,
      headers: ACTIONS_CORS_HEADERS,
    });
  }
};

function validatedQueryParams(requestUrl: URL) {
  let toPubkey: PublicKey = DEFAULT_SOL_ADDRESS;
  let amount: number = DEFAULT_SOL_AMOUNT;

  try {
    if (requestUrl.searchParams.get("to")) {
      toPubkey = new PublicKey(requestUrl.searchParams.get("to")!);
    }
  } catch (err) {
    throw "Invalid input query parameter: to";
  }

  try {
    if (requestUrl.searchParams.get("amount")) {
      amount = parseFloat(requestUrl.searchParams.get("amount")!);
    }

    if (amount <= 0) throw "amount is too small";
  } catch (err) {
    throw "Invalid input query parameter: amount";
  }

  return {
    amount,
    toPubkey,
  };
}
