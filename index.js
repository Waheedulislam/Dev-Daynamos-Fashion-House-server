const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const jwt = require("jsonwebtoken");
const port = 5000;
const { v4: uuidv4 } = require('uuid');


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // To parse URL-encoded bodies

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { default: axios } = require("axios");
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
    const paymentCollection = client.db('paymentDB').collection("payment");

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
      jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET,
        function (err, decoded) {
          if (err) {
            return res.status(401).send({ massage: "Unauthorize access" });
          }
          req.decoded = decoded;
          next();
        }
      );
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
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req?.params?.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await usersCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );
    // Users Delete
    app.delete(
      "/users/delete/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req?.params?.id;
        const result = await usersCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.send(result);
      }
    );
    ////////////////////// Product Collection ////////////////////////

    // post all product
    app.post("/products/add", async (req, res) => {
      const products = req.body;
      const result = await productCollection.insertOne(products);
      res.send(result);
    });
    // get all products
    // app.get("/products/all", async (req, res) => {
    //   const result = await productCollection.find().toArray();
    //   res.send(result);
    // });

    // all product get
    app.get("/products/all", async (req, res) => {
      try {
        const {
          brands,
          ram,
          colors,
          driveSizes,
          gpuBrands,
          processors,
          screenSizes,
        } = req.query;

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
          blogs = await blogsCollection
            .find()
            .skip(skip)
            .limit(limit)
            .toArray();
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

        res
          .status(200)
          .json({ message: "Product added to wishlist", wishlist });
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
        const updatedProducts = wishlist.products.filter(
          (product) => product._id !== productId
        );

        // Update the wishlist with the new products array
        await wishlistCollection.updateOne(
          { userId },
          { $set: { products: updatedProducts } }
        );

        res
          .status(200)
          .json({ message: "Product removed from wishlist", updatedProducts });
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
          const productExists = userCart.products.find(
            (p) => p.product._id === product._id
          );

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
        const updatedProducts = cart.products.filter(
          (item) => item.product._id !== productId
        );

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


    ////////////////////// Payment Collection Start ////////////////////////

// payment post api:
app.post("/create-payment", async (req, res) => {
  const paymentInfo = req.body;
  console.log(paymentInfo);

  const tran_id = uuidv4();

  const initiateData = {
    store_id: process.env.SSL_STORE_ID,
    store_passwd: process.env.SSL_STORE_PASSWORD,
    total_amount: paymentInfo.amount,
    currency: "EUR",
    tran_id: tran_id,
    success_url: "http://localhost:5000/payment-success",
    fail_url: "http://localhost:5000/payment-fail",
    cancel_url: "http://localhost:5000/payment-cancel",
    cus_name: "Customer Name",
    cus_email: "cust@yahoo.com",
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
    const response = await axios({
      method: "POST",
      url: "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
      data: initiateData,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    console.log("response data 313:", response.data);

    // Send Data to The Database
    const saveData = {
      paymentType: response.data.card_brand,
      paymentIssuer: response.data.card_issuer,
      customerName: "user name",
      customerEmail: "user email",
      paymentId: tran_id,
      amount: paymentInfo.amount,
      status: "Pending",
    };

    const saveUserInfoInDb = await paymentCollection.insertOne(saveData);

    if (saveUserInfoInDb) {
      res.send({
        paymentUrl: response.data.GatewayPageURL,
      });
    }
  } catch (error) {
    console.error(error);
  }

  // console.log(response);

  // res.json(response.data);
});

// success payment api:
app.post("/payment-success", async (req, res) => {
  try {
    const successData = req.body;
    console.log("success data 307:", successData);

    // Check if payment status is not valid
    if (successData.status !== "VALID") {
      return res.status(401).json({ message: "Unauthorized Payment, Invalid Payment" });
    }

    // Update The Database:
    const query = { paymentId: successData.tran_id };
    const update = { 
      $set: {
        status: "Success",
        paymentType: successData.card_brand,
        paymentIssuer: successData.card_issuer,
      } 
    };

    const result = await paymentCollection.updateOne(query, update);

    // If the update was successful, redirect the user to the success page
    if (result.modifiedCount === 1) {
      return res.redirect('http://localhost:5173/payment-success');
    } else {
      // If the update failed, return a failure response
      return res.status(400).json({ message: "Payment update failed" });
    }

  } catch (error) {
    console.error("Error updating payment status:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});


// payment cancel api:
app.post("/payment-cancel", async (req, res) => {
  
    res.redirect("http://localhost:5173/payment-cancel"); 
});


// payment fail api:
app.post("/payment-fail", async (req, res) => {

    res.redirect("http://localhost:5173/payment-fail"); 
});


 ////////////////////// Payment Collection End ////////////////////////

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

