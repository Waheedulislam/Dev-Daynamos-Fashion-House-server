const express = require("express");
const cors = require("cors");
require("dotenv").config();
const app = express();
const jwt = require("jsonwebtoken");
const port = 5000;

app.use(cors());
app.use(express.json());

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
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();

      res.send(result);
    });

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
    app.get("/blogs/list", async (req, res) => {
      const result = await blogsCollection.find().toArray();
      res.send(result);
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
