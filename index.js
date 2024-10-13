const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const jwt = require("jsonwebtoken");
const port = 5000;
const { v4: uuidv4 } = require("uuid");
const axios = require("axios");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // To parse URL-encoded bodies

// Create a Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail", // Replace with your preferred email service
  auth: {
    user: "infotechheim@gmail.com", // Admin email
    pass: "xjkqwtiwjqbqoesw", // Admin email password
  },
});
// Function to send email
const sendOrderEmail = async (orderDetails) => {
  const mailOptions = {
    from: `${orderDetails.customerEmail}`, // Sender email address (user's email)
    to: "infotechheim@gmail.com", // Admin email to receive notification
    subject: `New Order Placed - Order ID: ${orderDetails.paymentId}`, // Updated to use paymentId
    text: `A new order has been placed by ${orderDetails.customerName}.\n
           Order ID: ${orderDetails.paymentId}\n
           Total Amount: $${orderDetails.amount}\n
           Customer Email: ${orderDetails.customerEmail}\n
           Delivery Status: ${orderDetails.deliveryStatus || "Pending"}\n
           Order Timestamp: ${orderDetails.timestamp.toISOString()}\n`,
  };

  // Send the email
  await transporter.sendMail(mailOptions);
};

// Create a folder to store the receipts if it doesn't exist
const receiptFolder = path.join(__dirname, "receipts");
if (!fs.existsSync(receiptFolder)) {
  fs.mkdirSync(receiptFolder);
}

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cn4db.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    // Users
    const usersCollection = client.db("UsersDB").collection("Users");
    const productCollection = client.db("productDB").collection("Products");
    const blogsCollection = client.db("BlogsDB").collection("Blogs");
    const wishlistCollection = client.db("WishlistDB").collection("Wishlist");
    const cartCollection = client.db("CartListDB").collection("carts");
    const paymentCollection = client.db("paymentDB").collection("payment");

    // jwt related api
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });
      // console.log(token);
      res.send({ token });
    });
    // jwt middleware
    const verifyToken = (req, res, next) => {
      // console.log("inside-Token", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ massage: "Unauthorize access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
          return res.status(401).send({ massage: "Unauthorize access" });
        }
        req.decoded = decoded;
        next();
      });
    };
    // use verify admin after
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    ////////////////////// User Collection ////////////////////////
    // Users Post
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = {
        email: user?.email,
      };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({
          massage: "User Already Exists",
          insertedIn: null,
        });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // Users GET
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();

      res.send(result);
    });
    // single user get
    app.get("/users/single/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send(result);
    });
    // User profile update
    app.patch("/users/upProfile/:email", async (req, res) => {
      const email = req.params.email;
      const userData = req.body;
      const result = await usersCollection.updateOne(
        { email },
        {
          $set: userData,
        },
        { upsert: true }
      );
      res.send(result);
    });

    // admin check
    app.get("/users/admin/:email", verifyToken, async (req, res) => {
      const email = req?.params?.email;
      if (email !== req?.decoded?.email) {
        return res.status(403).send({ massage: "forbidden access" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });
    // Users patch make admin
    app.patch("/users/admin/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req?.params?.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });
    // Users Delete
    app.delete("/users/delete/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req?.params?.id;
      const result = await usersCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });
    ////////////////////// Product Collection ////////////////////////

    // post all product
    app.post("/products/add", async (req, res) => {
      const products = req.body;
      const result = await productCollection.insertOne(products);
      res.send(result);
    });
    app.get("/products/all/homePage", async (req, res) => {
      const result = await productCollection.find().toArray();
      res.send(result);
    });
    app.get("/products/all", async (req, res) => {
      try {
        const { brands, ram, colors, driveSizes, gpuBrands, processors, screenSizes } = req.query;

        // Initialize query object
        const query = {};

        // Add filters to the query object if they exist
        if (brands) query.brand = { $in: brands.split(",") };
        if (ram) query.ram = { $in: ram.split(",") };
        if (colors) query.color = { $in: colors.split(",") };
        if (driveSizes) query.driveSize = { $in: driveSizes.split(",") };
        if (gpuBrands) query.gpuBrand = { $in: gpuBrands.split(",") };
        if (processors) query.processor = { $in: processors.split(",") };
        if (screenSizes) query.screenSize = { $in: screenSizes.split(",") };

        // Fetch products based on filters or all products if no filters are provided
        const productsCursor =
          Object.keys(query).length === 0
            ? productCollection.find()
            : productCollection.find(query);

        // Convert cursor to an array
        const products = await productsCursor.toArray();

        // Send back the products or an empty array if no products exist
        res.status(200).json(products);
      } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ message: "Error fetching products" });
      }
    });

    // get single products
    app.get("/products/details/:id", async (req, res) => {
      const id = req?.params?.id;
      const result = await productCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    // patch product
    app.patch("/products/edit/:id", async (req, res) => {
      const id = req?.params?.id;
      const editProduct = req.body;
      const result = await productCollection.updateOne(
        {
          _id: new ObjectId(id),
        },
        {
          $set: editProduct,
        }
      );
      res.send(result);
    });
    // delete product
    app.delete("/products/delete/:id", async (req, res) => {
      const id = req?.params?.id;
      const result = await productCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    ////////////////////// Blog Collection ////////////////////////

    // Blogs add
    app.post("/blogs/add", async (req, res) => {
      const blogs = req.body;
      const result = await blogsCollection.insertOne(blogs);
      res.send(result);
    });

    // Blogs get
    app.get("/blogs/lists", async (req, res) => {
      const result = await blogsCollection.find().toArray();
      res.send(result);
    });

    // Blogs get with pagination and option for all data
    app.get("/blogs/list", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const getAll = req.query.getAll === "true";

        let blogs;
        let totalBlogs;

        if (getAll) {
          blogs = await blogsCollection.find().toArray();
          totalBlogs = blogs.length;
        } else {
          const skip = (page - 1) * limit;
          totalBlogs = await blogsCollection.countDocuments();
          blogs = await blogsCollection.find().skip(skip).limit(limit).toArray();
        }

        res.status(200).json({
          blogs,
          currentPage: getAll ? 1 : page,
          totalPages: getAll ? 1 : Math.ceil(totalBlogs / limit),
          totalBlogs,
          limit: getAll ? totalBlogs : limit,
        });
      } catch (error) {
        console.error("Error fetching blogs:", error);
        res.status(500).json({ message: "Error fetching blogs" });
      }
    });

    // Blogs single data get
    app.get("/blogs/details/:id", async (req, res) => {
      const id = req?.params?.id;
      const result = await blogsCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    // Blogs Delete
    app.delete("/blogs/delete/:id", async (req, res) => {
      const id = req.params.id;
      const result = await blogsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    ////////////////////// wishlist Collection ////////////////////////

    // wishlist post
    app.post("/wishlist/add", async (req, res) => {
      const { user, product } = req.body;

      try {
        // Check if the wishlist for the user already exists
        let wishlist = await wishlistCollection.findOne({ userId: user });

        if (!wishlist) {
          // If no wishlist exists, create a new one
          wishlist = {
            userId: user,
            products: [product], // Assuming product._id is the product ID
          };
          await wishlistCollection.insertOne(wishlist);
        } else {
          // If wishlist exists, check if the product is already in the wishlist
          if (!wishlist.products.includes(product)) {
            // Add the product ID to the wishlist
            wishlist.products.push(product);
            await wishlistCollection.updateOne(
              { userId: user },
              { $set: { products: wishlist.products } }
            );
          }
        }

        res.status(200).json({ message: "Product added to wishlist", wishlist });
      } catch (error) {
        console.error("Error adding product to wishlist:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // wishlist get
    // GET API to retrieve wishlist for a specific user
    app.get("/wishlist/:userId", async (req, res) => {
      const { userId } = req.params; // Extract userId from request parameters

      try {
        // Find the wishlist for the given userId
        const wishlist = await wishlistCollection.findOne({ userId: userId });

        if (!wishlist) {
          return res.status(404).json({ message: "Wishlist not found" });
        }

        // Return the wishlist with the products
        res.status(200).json(wishlist);
      } catch (error) {
        console.error("Error retrieving wishlist:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // DELETE API to remove a product from the wishlist
    app.delete("/wishlist/remove", async (req, res) => {
      const { userId, productId } = req.body; // Receiving userId and productId from the request body

      try {
        // Find the user's wishlist
        const wishlist = await wishlistCollection.findOne({ userId });

        if (!wishlist) {
          return res.status(404).json({ message: "Wishlist not found" });
        }

        // Filter out the product from the products array
        const updatedProducts = wishlist.products.filter((product) => product._id !== productId);

        // Update the wishlist with the new products array
        await wishlistCollection.updateOne({ userId }, { $set: { products: updatedProducts } });

        res.status(200).json({ message: "Product removed from wishlist", updatedProducts });
      } catch (error) {
        console.error("Error removing product from wishlist:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    ////////////////////// cart Collection ////////////////////////

    // Add product to cart
    app.post("/cart/add", async (req, res) => {
      const { userEmail, product } = req.body; // Accept full product object in request

      try {
        // Find the user's cart
        let userCart = await cartCollection.findOne({ userEmail });

        if (userCart) {
          // Check if the product is already in the cart
          const productExists = userCart.products.find((p) => p.product._id === product._id);

          if (productExists) {
            // If product exists, return a message
            res.status(200).json({ message: "Product already in cart" });
          } else {
            // Add the new product to the cart
            await cartCollection.updateOne(
              { userEmail },
              { $push: { products: { product, quantity: 1 } } } // Store the full product object
            );
            res.status(200).json({ message: "Product added to cart" });
          }
        } else {
          // If no cart exists, create a new one for the user
          await cartCollection.insertOne({
            userEmail,
            products: [{ product, quantity: 1 }], // Store full product object
          });
          res.status(201).json({ message: "Cart created and product added" });
        }
      } catch (error) {
        console.error("Error adding to cart:", error);
        res.status(500).json({ error: "Failed to add product to cart" });
      }
    });

    // Get user's cart with total price calculation
    app.get("/cart/:userEmail", async (req, res) => {
      const { userEmail } = req.params;

      try {
        // Find the user's cart
        const userCart = await cartCollection.findOne({ userEmail });

        if (userCart) {
          const products = userCart.products || []; // Default to an empty array if products is undefined

          // Calculate total price
          const totalPrice = products.reduce((total, item) => {
            const productPrice = item.product.sellPrice
              ? parseFloat(item.product.sellPrice)
              : parseFloat(item.product.regularPrice);
            return total + productPrice * item.quantity;
          }, 0);

          // Return cart details and total price
          res.status(200).json({
            cart: products,
            totalPrice: totalPrice.toFixed(2), // Rounding to two decimal places
          });
        } else {
          // If no cart is found, return empty cart and total price as 0.00
          res.status(200).json({
            cart: [],
            totalPrice: "0.00",
          });
        }
      } catch (error) {
        console.error("Error fetching cart:", error);
        res.status(500).json({ error: "Failed to fetch cart" });
      }
    });

    // Delete user's product from cart

    app.delete("/cart/delete", async (req, res) => {
      const { userEmail, productId } = req.body; // Expecting userEmail and productId in the request body

      try {
        // Find the user's cart
        const cart = await cartCollection.findOne({ userEmail });

        if (!cart) {
          return res.status(404).json({ message: "Cart not found" });
        }

        // Filter out the product from the products array
        const updatedProducts = cart.products.filter((item) => item.product._id !== productId);

        // Update the cart with the new products array
        const updateResult = await cartCollection.updateOne(
          { userEmail },
          { $set: { products: updatedProducts } }
        );

        if (updateResult.modifiedCount > 0) {
          res.status(200).json({
            message: "Product removed from cart",
            updatedCart: updatedProducts,
          });
        } else {
          res.status(404).json({ message: "Product not found in cart" });
        }
      } catch (error) {
        console.error("Error removing product from cart:", error);
        res.status(500).json({ error: "Failed to remove product from cart" });
      }
    });

    // Update product quantity in the cart
    app.put("/cart/update-quantity", async (req, res) => {
      const { userEmail, productId, action } = req.body; // Expecting action to be either "increase" or "decrease"

      try {
        let updateQuery;

        if (action === "increase") {
          updateQuery = { $inc: { "products.$.quantity": 1 } };
        } else if (action === "decrease") {
          updateQuery = { $inc: { "products.$.quantity": -1 } };
        } else {
          return res.status(400).json({ message: "Invalid action" });
        }

        // Update quantity
        const result = await cartCollection.updateOne(
          { userEmail, "products.product._id": productId },
          updateQuery
        );

        if (result.modifiedCount > 0) {
          // Check if quantity is now 0 and remove the product if it is
          const updatedCart = await cartCollection.findOne({ userEmail });
          const product = updatedCart.products.find((p) => p.product._id === productId);

          if (product && product.quantity <= 0) {
            await cartCollection.updateOne(
              { userEmail },
              { $pull: { products: { "product._id": productId } } }
            );
          }

          res.status(200).json({
            message: `Quantity ${action === "increase" ? "increased" : "decreased"}`,
          });
        } else {
          res.status(404).json({ message: "Product not found in cart" });
        }
      } catch (error) {
        console.error(`Error updating quantity:`, error);
        res.status(500).json({ error: "Failed to update quantity" });
      }
    });

    // Endpoint to clear the cart for a user
    app.post("/api/cart/clear/:userEmail", async (req, res) => {
      try {
        const { userEmail } = req.params;
        await cartCollection.updateOne({ userEmail }, { $set: { products: [] } });
        res.status(200).json({ message: "Cart cleared successfully" });
      } catch (error) {
        res.status(500).json({ message: "Error clearing cart" });
      }
    });

    ////////////////////// Payment Collection Start ////////////////////////

    // Payment post API
    app.post("/create-payment", async (req, res) => {
      const paymentInfo = req.body;
      const tran_id = uuidv4(); // Generates a unique transaction ID
      const userEmail = paymentInfo.userEmail;

      const initiateData = {
        store_id: process.env.SSL_STORE_ID,
        store_passwd: process.env.SSL_STORE_PASSWORD,
        total_amount: paymentInfo.totalPrice,
        currency: "EUR",
        tran_id: tran_id,
        success_url: "http://localhost:5000/payment-success",
        fail_url: "http://localhost:5000/payment-fail",
        cancel_url: "http://localhost:5000/payment-cancel",
        cus_name: paymentInfo.userName,
        cus_email: userEmail,
        cus_add1: "Dhaka",
        cus_add2: "Dhaka",
        cus_city: "Dhaka",
        cus_state: "Dhaka",
        cus_postcode: "1000",
        cus_country: "Bangladesh",
        cus_phone: "01711111111",
        cus_fax: "01711111111",
        shipping_method: "NO",
        product_name: "Computer",
        product_category: "Electronic",
        product_profile: "general",
        multi_card_name: "mastercard,visacard,amexcard",
        value_a: "ref001_A",
        value_b: "ref002_B",
        value_c: "ref003_C",
        value_d: "ref004_D",
      };

      try {
        // Initiate the payment request to SSLCommerz
        const response = await axios({
          method: "POST",
          url: "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
          data: initiateData,
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });

        const newPayment = {
          paymentType: response.data.card_brand || "N/A",
          paymentIssuer: response.data.card_issuer || null,
          customerName: paymentInfo.userName || "Unknown",
          customerEmail: paymentInfo.userEmail,
          paymentId: tran_id, // Use the same tran_id for payment success query
          amount: paymentInfo.totalPrice,
          status: "Pending", // Payment status is pending until confirmed
          timestamp: new Date(),
          deliveryStatus: "",
          cart: paymentInfo.cart || [],
        };

        const existingUser = await paymentCollection.findOne({
          customerEmail: userEmail,
        });

        if (existingUser) {
          const updateResult = await paymentCollection.updateOne(
            { customerEmail: userEmail },
            { $push: { userPayment: newPayment } }
          );
          // After order is saved, send email to the admin
          await sendOrderEmail(newPayment); // Pass user's email

          if (updateResult.matchedCount === 0 || updateResult.modifiedCount === 0) {
            console.error("Payment update failed for existing user.");
            return res.status(500).send("Payment update failed");
          }
        } else {
          const newUser = {
            customerEmail: userEmail,
            userPayment: [newPayment],
          };

          const insertResult = await paymentCollection.insertOne(newUser);
          // After order is saved, send email to the admin
          await sendOrderEmail(newPayment); // Pass user's email

          if (!insertResult.acknowledged) {
            console.error("Failed to insert new user");
            return res.status(500).send("Failed to insert new user");
          }
        }

        res.send({
          paymentUrl: response.data.GatewayPageURL,
        });
      } catch (error) {
        console.error("Error creating payment:", error);
        res.status(500).send("Payment creation failed");
      }
    });

    // success payment api:
    app.post("/payment-success", async (req, res) => {
      try {
        const successData = req.body;
        console.log("success data 307:", successData);

        // Check if payment status is valid
        if (successData.status !== "VALID") {
          return res.status(401).json({ message: "Unauthorized Payment, Invalid Payment" });
        }

        // Log transaction ID to make sure it exists
        console.log("Transaction ID:", successData.tran_id);

        // Update the database with payment success details
        const query = { "userPayment.paymentId": successData.tran_id }; // Update based on paymentId
        const update = {
          $set: {
            "userPayment.$.status": "Success", // Update the specific payment
            "userPayment.$.paymentType": successData.card_brand,
            "userPayment.$.paymentIssuer": successData.card_issuer,
          },
        };

        const result = await paymentCollection.updateOne(query, update);

        // Check if the update was successful
        if (result.modifiedCount === 1) {
          return res.redirect("http://localhost:5173/payment-success");
        } else {
          console.error("Payment update failed. Result:", result);
          return res.status(400).json({ message: "Payment update failed" });
        }
      } catch (error) {
        console.error("Error updating payment status:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    });

    // payment cancel api:
    app.post("/payment-cancel", async (req, res) => {
      try {
        const cancelData = req.body;
        console.log("Cancel Data Received:", cancelData); // Log the received data for debugging

        // Ensure the transaction ID (tran_id) exists
        if (!cancelData.tran_id) {
          return res.status(400).json({ message: "Transaction ID is missing" });
        }

        // Query the database to find the transaction in the userPayment array
        const query = { "userPayment.paymentId": cancelData.tran_id }; // Match paymentId inside the userPayment array

        // Update the payment status to 'Cancel' in the database
        const update = {
          $set: {
            "userPayment.$.status": "Cancel", // Update the specific payment status
            "userPayment.$.paymentType": cancelData.card_type || "N/A", // Set card type if available
          },
        };

        // Log query and update for debugging purposes
        console.log("Query:", query);
        console.log("Update:", update);

        const result = await paymentCollection.updateOne(query, update);

        // Check if the update modified any documents
        if (result.matchedCount === 0) {
          console.error("No matching payment found for the transaction ID:", cancelData.tran_id);
          return res.status(404).json({ message: "No matching payment found" });
        }

        if (result.modifiedCount === 1) {
          // Payment update successful, redirect to the cancel page
          return res.redirect("http://localhost:5173/payment-cancel");
        } else {
          console.error("Payment update failed, document was not modified.");
          return res.status(400).json({ message: "Payment status update failed" });
        }
      } catch (error) {
        console.error("Error updating payment status to 'Cancel':", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    });

    // payment fail api:
    app.post("/payment-fail", async (req, res) => {
      try {
        const failData = req.body;
        console.log("Failure Data Received:", failData); // Log the received data

        // Ensure failData contains the required transaction ID (tran_id)
        if (!failData.tran_id) {
          return res.status(400).json({ message: "Transaction ID is missing" });
        }

        // Update the database to mark payment as failed
        const query = { "userPayment.paymentId": failData.tran_id }; // Match the payment by paymentId in userPayment array
        const update = {
          $set: {
            "userPayment.$.status": "Failed",
            "userPayment.$.paymentType": failData.card_type || "N/A", // Set to "N/A" if no card type is available
          },
        };

        // Log query and update to debug
        console.log("Query:", query);
        console.log("Update:", update);

        const result = await paymentCollection.updateOne(query, update);

        // Check if the update modified any documents
        if (result.matchedCount === 0) {
          console.error("No matching payment found for the transaction ID:", failData.tran_id);
          return res.status(404).json({ message: "No matching payment found" });
        }

        if (result.modifiedCount === 1) {
          // Payment update successful, redirect to the failure page
          return res.redirect("http://localhost:5173/payment-fail");
        } else {
          console.error("Payment update failed, document was not modified.");
          return res.status(400).json({ message: "Payment status update failed" });
        }
      } catch (error) {
        console.error("Error updating payment status to Failed:", error);
        return res.status(500).json({ message: "Internal server error" });
      }
    });
    // Payment Get APi:
    app.get("/get-payments", async (req, res) => {
      try {
        // Assume you are using userEmail for user authentication
        const userEmail = req.query.email; // Pass user email as a query parameter or get it from authentication

        // Query to find payment data based on user email
        const userPayments = await paymentCollection.findOne({
          customerEmail: userEmail,
        });

        if (!userPayments) {
          return res.status(404).json({ message: "No payment data found for this user" });
        }

        // Send the payment data back to the frontend
        res.json(userPayments);
      } catch (error) {
        console.error("Error fetching payment data:", error);
        res.status(500).json({ message: "Failed to fetch payment data" });
      }
    });

    app.get("/get-payments/:id", async (req, res) => {
      try {
        const paymentId = req.params.id;

        // Query to find payment data based on payment ID
        const payment = await paymentCollection.findOne({
          "userPayment.paymentId": paymentId,
        });

        if (!payment) {
          return res.status(404).json({ message: "No payment data found for this ID" });
        }

        // Find the specific payment within the userPayment array
        const specificPayment = payment.userPayment.find((p) => p.paymentId === paymentId);

        if (!specificPayment) {
          return res.status(404).json({ message: "No payment data found for this ID" });
        }

        // Send the specific payment data back to the frontend
        res.json(specificPayment);
      } catch (error) {
        console.error("Error fetching payment data:", error);
        res.status(500).json({ message: "Failed to fetch payment data" });
      }
    });

    // GET API to fetch payment data for all users for admin manage order

    app.get("/api/payments/alluser", async (req, res) => {
      try {
        const payments = await paymentCollection
          .aggregate([
            {
              $match: {
                "userPayment.status": "Success",
              },
            },
            {
              $project: {
                customerEmail: 1,
                userPayment: {
                  $filter: {
                    input: "$userPayment",
                    as: "payment",
                    cond: { $eq: ["$$payment.status", "Success"] },
                  },
                },
              },
            },
          ])
          .toArray();

        res.status(200).json(payments);
      } catch (error) {
        console.error("Error fetching payments:", error);
        res.status(500).json({ error: "Internal Server Error" });
      }
    });

    // change deleivery status for user payment  from admin manage order
    app.patch("/api/payments/:paymentId", async (req, res) => {
      const { paymentId } = req.params;
      const { deliveryStatus } = req.body;

      try {
        // Find the order by paymentId and update the deliveryStatus
        const result = await paymentCollection.updateOne(
          { "userPayment.paymentId": paymentId },
          { $set: { "userPayment.$.deliveryStatus": deliveryStatus } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ message: "Payment not found or not updated" });
        }

        res.json({ message: "Delivery status updated successfully" });
      } catch (error) {
        res.status(500).json({ message: "Error updating delivery status", error });
      }
    });
    // Get Success Latest Payment
    app.get("/get-latest-payment", async (req, res) => {
      try {
        const userEmail = req.query.email;

        // Find the user by email
        const user = await paymentCollection.findOne({
          customerEmail: userEmail,
        });

        if (!user || !user.userPayment || user.userPayment.length === 0) {
          return res.status(404).json({ message: "No payment data found" });
        }

        // Get the latest payment (last entry in userPayment array)
        const latestPayment = user.userPayment[user.userPayment.length - 1];

        res.status(200).json(latestPayment);
      } catch (error) {
        console.error("Error fetching latest payment:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });
    ////////////////////// Payment Collection End ////////////////////////

    ////////////////////// stats or analytics ////////////////////////
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const users = await usersCollection.estimatedDocumentCount();
      const products = await productCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      const result = await paymentCollection
        .aggregate([
          {
            $unwind: "$userPayment", // Unwind the userPayment array
          },
          {
            $match: {
              "userPayment.status": "Success", // Only consider successful payments
            },
          },
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$userPayment.amount", // Sum up the amounts of successful payments
              },
            },
          },
        ])
        .toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        users,
        products,
        orders,
        revenue,
      });
    });

    // Route to generate and download a receipt
    app.post("/api/generate-receipt", (req, res) => {
      const {
        timestamp,
        status,
        paymentType,
        paymentIssuer,
        paymentId,
        deliveryStatus,
        customerName,
        customerEmail,
        amount,
        cart,
      } = req.body;

      console.log(cart);

      const doc = new PDFDocument();
      const receiptPath = path.join(receiptFolder, `receipt_${paymentId}.pdf`);

      // Stream PDF file to write on disk
      const writeStream = fs.createWriteStream(receiptPath);
      doc.pipe(writeStream);

      // Generate receipt content
      doc.fontSize(20).text("Tech Heim", { align: "center" });
      doc.fontSize(12).text("-------------------------------------------", { align: "center" });
      doc.text("Official Payment Receipt", { align: "center" });
      doc.text("-------------------------------------------", { align: "center" });

      doc.text(`Receipt #: ${paymentId.slice(0, 5)}`);
      doc.text(`Transaction ID: TXN-${paymentId}`);
      doc.text(`Order Date: ${new Date(timestamp).toLocaleDateString()}`);
      doc.text(`Receipt Download Date: ${new Date().toLocaleDateString()}`);
      doc.text("-------------------------------------------");
      doc.text(`Billed To: ${customerName}`);
      // doc.text(`Phone: ${customer.phone}`);
      doc.text(`Email: ${customerEmail}`);
      doc.text("-------------------------------------------");

      doc.text("Items Purchased:");
      cart.forEach((item, index) => {
        const product = item.product;
        doc.text(`${index + 1}. ${product.name}`); // First line for the product name
        doc.text(`Qty: ${item.quantity}`); // First line for the product name
        doc.text(`Price: $${product.sellPrice}`); // Second line for quantity and price
        doc.moveDown(); // Adds a line break after each item
      });
      doc.text("-------------------------------------------");
      doc.text(`Payment Status: ${status}`);
      doc.text(`payment Type: ${paymentType}`);
      doc.text(`payment Issuer: ${paymentIssuer}`);

      const tax = (amount * 0.05).toFixed(2);
      const grandTotal = (amount + parseFloat(tax)).toFixed(2);

      doc.text("-------------------------------------------");
      doc.text(`Subtotal: $${amount.toFixed(2)}`);
      doc.text(`Tax (5%): $${tax}`);
      doc.text("-------------------------------------------");
      doc.fontSize(14).text(`Total Amount: $${grandTotal}`);
      doc.text("-------------------------------------------");
      doc.text("Thank you for your purchase!");

      doc.end();

      // Wait for the PDF to finish writing
      writeStream.on("finish", () => {
        // Serve the generated PDF file
        const file = fs.readFileSync(receiptPath);
        res.contentType("application/pdf");
        res.send(file);
      });

      writeStream.on("error", (err) => {
        console.error("Error writing PDF file", err);
        res.status(500).send("Error generating receipt");
      });
    });

    console.log("You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Route  is Working");
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});

// userName= infotechheim
// pass = HDWydNQvMfOfQL2L
